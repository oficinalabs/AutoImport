/**
 * Matching determinístico em dois passos:
 *   pnpm exec tsx scripts/pipeline/match-models.ts [--rematch]
 *
 * A) MODELO (vehicle_models) — INTOCADO:
 *   1. norm_key = make|model|fuel (lib/engine/normalize-vehicle.ts)
 *   2. upsert vehicle_models por norm_key; liga listing.model_id + fuel
 *   3. enriquece o modelo com medianas (cc/CO₂/potência) dos anúncios ligados
 *   4. relatório: taxa de match + top-20 não-mapeados (alimenta o dicionário)
 *
 * B) VERSÃO — resolver estrito (lib/engine/match-version.ts):
 *   backfill natural dos ativos sem versão (ou TODOS com --rematch), a escrever
 *   us_version_id/match_confidence/match_evidence/designation_facts em lotes.
 *   `exato` grava a versão; `designacao` grava os factos; `provavel`/null gravam
 *   tudo a null (só contam no relatório). NÃO toca em fuel/model_id/updated_at
 *   (SQL cru → sem $onUpdate); só reescreve quando a resolução muda
 *   (determinístico ⇒ 2.ª corrida = 0 updates).
 */
import type { DesignationFacts } from "../../lib/engine/match-version";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

/** Divide um array em lotes de tamanho `size` (para os UPDATE batched da versão). */
function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Pathname do detail_url legível: separadores (/-_.+) → espaço, sem URL-encoding.
 * O slug traz o corpo/derivado ("gran-tourer") que make/model/variant perdem. */
function pathText(url: string | null): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[/\-_.+]/g, " ");
  } catch {
    return null;
  }
}

export async function matchModels(opts: { rematch?: boolean } = {}) {
  const { db } = await import("../../db");
  const { inArray, sql } = await import("drizzle-orm");
  const { listings, vehicleModels } = await import("../../db/schema");
  const { normalizeVehicle } = await import("../../lib/engine/normalize-vehicle");

  // ════════════════════════════════════════════════════════════════
  // A) MODELO — vehicle_models (comportamento inalterado)
  // ════════════════════════════════════════════════════════════════

  // Anúncios ativos ainda sem modelo (variant e co2 desambiguam HEV vs PHEV)
  const pending = (await db.execute(sql`
    select id, make_raw, model_raw, fuel_raw, variant, co2
    from listings
    where model_id is null and deleted_at is null
  `)) as unknown as {
    id: string;
    make_raw: string | null;
    model_raw: string | null;
    fuel_raw: string | null;
    variant: string | null;
    co2: number | null;
  }[];

  // norm_key → ids de listings; contagem de não-mapeados por (make, model, fuel) cru
  const byKey = new Map<string, { make: string; model: string; fuel: string; ids: string[] }>();
  const unmapped = new Map<string, number>();
  for (const row of pending) {
    const v = normalizeVehicle(row.make_raw, row.model_raw, row.fuel_raw, row.variant, row.co2);
    if (!v) {
      const k = `${row.make_raw} | ${row.model_raw} | ${row.fuel_raw}`;
      unmapped.set(k, (unmapped.get(k) ?? 0) + 1);
      continue;
    }
    const entry = byKey.get(v.normKey) ?? { make: v.make, model: v.model, fuel: v.fuel, ids: [] };
    entry.ids.push(row.id);
    byKey.set(v.normKey, entry);
  }

  // Upsert dos modelos + ligação dos listings
  let matched = 0;
  for (const [normKey, { make, model, fuel, ids }] of byKey) {
    const rows = await db
      .insert(vehicleModels)
      .values({ make, model, fuel, normKey })
      .onConflictDoUpdate({ target: vehicleModels.normKey, set: { updatedAt: new Date() } })
      .returning({ id: vehicleModels.id });
    const modelId = rows[0].id;
    await db.update(listings).set({ modelId, fuel }).where(inArray(listings.id, ids));
    matched += ids.length;
  }

  // Enriquecimento: medianas dos anúncios ligados quando o modelo não as tem
  await db.execute(sql`
    update vehicle_models vm set
      displacement_cc = coalesce(vm.displacement_cc, agg.cc),
      co2 = coalesce(vm.co2, agg.co2),
      power_hp = coalesce(vm.power_hp, agg.hp),
      updated_at = now()
    from (
      select model_id,
        percentile_cont(0.5) within group (order by displacement_cc)::int as cc,
        percentile_cont(0.5) within group (order by co2)::int as co2,
        percentile_cont(0.5) within group (order by power_hp)::int as hp
      from listings
      where model_id is not null and deleted_at is null
      group by model_id
    ) agg
    where agg.model_id = vm.id
      and (vm.displacement_cc is null or vm.co2 is null or vm.power_hp is null)
  `);

  const total = pending.length;
  const rate = total ? Math.round((matched / total) * 1000) / 10 : 100;
  console.log(`match-models: ${matched}/${total} ligados (${rate}%) · ${byKey.size} modelos`);
  const top = [...unmapped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (top.length) {
    console.log("top não-mapeados (make | model | fuel → n):");
    for (const [k, n] of top) console.log(`  ${k} → ${n}`);
  }

  // ════════════════════════════════════════════════════════════════
  // B) VERSÃO — us_version_id (resolver estrito, Fase 3)
  // ════════════════════════════════════════════════════════════════
  const versao = await resolveVersions(db, sql, Boolean(opts.rematch));

  return { total, matched, models: byKey.size, versao };
}

/**
 * Serialização canónica (chaves ordenadas recursivamente) para comparar factos:
 * o jsonb do Postgres reordena as chaves, por isso um JSON.stringify direto de
 * `curFacts` vs os novos daria falsos "changed". null → null.
 */
function canon(v: unknown): string | null {
  if (v == null) return null;
  const sort = (x: unknown): unknown => {
    if (x === null || typeof x !== "object") return x;
    if (Array.isArray(x)) return x.map(sort);
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sort(o[k]);
    return out;
  };
  return JSON.stringify(sort(v));
}

/**
 * Resolve anúncio → versão do catálogo e escreve as 4 colunas em lotes.
 * `rematch` false: só os ativos sem us_version_id E que não são já `designacao`
 * (senão as linhas designacao — que têm us_version_id null — seriam re-resolvidas
 * todos os dias). `rematch` true: reavalia TODOS os ativos.
 * Só escreve `exato` (us_version_id) e `designacao` (designation_facts); `provavel`
 * e null gravam tudo a null (só contam no relatório). Escreve só quando a
 * resolução muda — determinístico ⇒ idempotente.
 */
async function resolveVersions(
  db: typeof import("../../db").db,
  sql: typeof import("drizzle-orm").sql,
  rematch: boolean,
) {
  const { buildUsCatalog } = await import("../../lib/engine/us-catalog");
  const { resolveVersion } = await import("../../lib/engine/match-version");
  const cat = await buildUsCatalog(db);

  const rows = (await db.execute(sql`
    select id::text as id, make_raw as "makeRaw", model_raw as "modelRaw", variant,
           fuel_raw as "fuelRaw", year, power_hp as "powerHp",
           displacement_cc as "displacementCc", co2,
           gearbox, doors, raw->>'engine_code' as "engineCode",
           detail_url as "detailUrl", raw->>'title' as "rawTitle",
           us_version_id as "curVid", match_confidence as "curConf",
           designation_facts as "curFacts"
    from listings
    where deleted_at is null and make_raw is not null and model_raw is not null
      ${rematch ? sql`` : sql`and us_version_id is null and match_confidence is distinct from 'designacao'`}
  `)) as unknown as {
    id: string;
    makeRaw: string;
    modelRaw: string;
    variant: string | null;
    fuelRaw: string | null;
    year: number | null;
    powerHp: number | null;
    displacementCc: number | null;
    co2: number | null;
    gearbox: string | null;
    doors: number | null;
    engineCode: string | null;
    detailUrl: string | null;
    rawTitle: string | null;
    curVid: string | null;
    curConf: string | null;
    curFacts: unknown;
  }[];

  // Só escrever o que muda. Como o resolver é determinístico, comparar (vid, conf,
  // factos canónicos) chega — a evidência é derivada e muda com eles.
  const changed: {
    id: string;
    vid: string | null;
    conf: string | null;
    ev: string | null;
    df: string | null;
  }[] = [];
  let provavelRun = 0; // contado in-memory (não é escrito): só relatório
  const splitterCounts: Record<string, number> = {};
  for (const row of rows) {
    // extraText = título + slug do detail_url. Traz o corpo/derivado ("gran
    // tourer") que make/model/variant perdem; SÓ alimenta a desambiguação
    // (derivativeGuard/trim), nunca sinais duros — o resolver garante-o.
    const extraText = [row.rawTitle, pathText(row.detailUrl)].filter(Boolean).join(" ") || null;
    const r = resolveVersion({ ...row, extraText }, cat);
    let vid: string | null = null;
    let conf: string | null = null;
    let evidence: unknown = null;
    let facts: DesignationFacts | null = null;
    if (r?.kind === "exato") {
      vid = r.versionId;
      conf = "exato";
      evidence = r.evidence;
      for (const s of r.evidence.splitters ?? []) splitterCounts[s] = (splitterCounts[s] ?? 0) + 1;
    } else if (r?.kind === "designacao") {
      conf = "designacao";
      evidence = r.evidence;
      facts = r.facts;
    } else if (r?.kind === "provavel") {
      provavelRun++;
    }
    if (vid === row.curVid && conf === row.curConf && canon(facts) === canon(row.curFacts))
      continue;
    changed.push({
      id: row.id,
      vid,
      conf,
      ev: evidence ? JSON.stringify(evidence) : null,
      df: facts ? JSON.stringify(facts) : null,
    });
  }

  // UPDATE batched via `from (values …)` — um statement por lote (não 22k).
  for (const batch of chunk(changed, 500)) {
    const values = sql.join(
      batch.map(
        (c) =>
          sql`(${c.id}::uuid, ${c.vid}::text, ${c.conf}::text, ${c.ev}::jsonb, ${c.df}::jsonb)`,
      ),
      sql`, `,
    );
    await db.execute(sql`
      update listings as l set
        us_version_id = data.uv,
        match_confidence = data.mc,
        match_evidence = data.me,
        designation_facts = data.df
      from (values ${values}) as data(id, uv, mc, me, df)
      where l.id = data.id
    `);
  }

  // ── Relatório: por tier e por fonte (sobre TODOS os ativos) ──
  // Tiers da BD: exato · designacao · legado (confirmado+provavel, sobrevive até
  // ao rematch) · null. Mais o provavel desta corrida (in-memory) e o breakdown
  // dos splitters que separaram exatos.
  const dist = (await db.execute(sql`
    select source_site, match_confidence as conf, count(*)::int as n
    from listings where deleted_at is null
    group by source_site, match_confidence
  `)) as unknown as { source_site: string; conf: string | null; n: number }[];

  type Tiers = { exato: number; designacao: number; legado: number; null: number };
  const tierOf = (conf: string | null): keyof Tiers =>
    conf === "exato"
      ? "exato"
      : conf === "designacao"
        ? "designacao"
        : conf == null
          ? "null"
          : "legado";
  const perSource = new Map<string, Tiers>();
  const tiers: Tiers = { exato: 0, designacao: 0, legado: 0, null: 0 };
  for (const d of dist) {
    const b = perSource.get(d.source_site) ?? { exato: 0, designacao: 0, legado: 0, null: 0 };
    const key = tierOf(d.conf);
    b[key] += d.n;
    tiers[key] += d.n;
    perSource.set(d.source_site, b);
  }
  const total = (t: Tiers) => t.exato + t.designacao + t.legado + t.null;
  const ativos = total(tiers);
  const pct = (n: number) => (ativos ? Math.round((n / ativos) * 1000) / 10 : 0);
  const splitterStr =
    Object.entries(splitterCounts)
      .map(([s, n]) => `${s}=${n}`)
      .join(" ") || "—";
  console.log(
    `\nmatch-version${rematch ? " (--rematch)" : ""}: ${changed.length} escritos · ` +
      `exato ${tiers.exato} (${pct(tiers.exato)}%) · designacao ${tiers.designacao} (${pct(tiers.designacao)}%) · ` +
      `legado ${tiers.legado} · sem match ${tiers.null} · provavel(desta corrida) ${provavelRun} · splitters ${splitterStr}`,
  );
  const linhas = [...perSource.entries()].sort((a, b) => total(b[1]) - total(a[1]));
  for (const [s, b] of linhas) {
    console.log(
      `  ${s.padEnd(22)} exato=${b.exato} desig=${b.designacao} legado=${b.legado} null=${b.null}`,
    );
  }

  // ── Top-20 alvos: anúncios COM potência mas sem cobertura de versão. Coberto =
  // exato, designacao OU o legado confirmado (dual-read até ao rematch). ──
  const alvos = (await db.execute(sql`
    select make_raw as make, model_raw as model, fuel_raw as fuel, count(*)::int as n
    from listings
    where deleted_at is null and power_hp is not null
      and match_confidence is distinct from 'exato'
      and match_confidence is distinct from 'designacao'
      and match_confidence is distinct from 'confirmado'
    group by make_raw, model_raw, fuel_raw
    order by n desc, make_raw, model_raw, fuel_raw
    limit 20
  `)) as unknown as { make: string | null; model: string | null; fuel: string | null; n: number }[];
  if (alvos.length) {
    console.log("top-20 com potência mas sem cobertura de versão (make | model | fuel → n):");
    for (const a of alvos) console.log(`  ${a.make} | ${a.model} | ${a.fuel} → ${a.n}`);
  }

  return { escritos: changed.length, tiers, provavelRun };
}

// Executável direto (também importável pelo run-daily)
if (process.argv[1]?.endsWith("match-models.ts")) {
  matchModels({ rematch: process.argv.includes("--rematch") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
