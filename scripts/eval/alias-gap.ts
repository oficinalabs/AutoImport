/**
 * Alias-gap — famílias de anúncios (via `normalizeVehicle`) que existem no lado
 * dos anúncios mas NÃO têm família correspondente no índice do catálogo us_*
 * (`buildUsCatalog`). São os buracos que impedem o matching de versão: o modelo
 * normaliza, mas o catálogo não tem essa família → nunca há `confirmado`.
 *
 *   pnpm exec tsx scripts/eval/alias-gap.ts [--min 5]
 *
 * Para cada gap com ≥N anúncios (default 5), sugere a família mais próxima da
 * MESMA marca por distância de edição (Levenshtein) sobre a designação — pista
 * para uma regra em `MODEL_RULES` (ou para recolher a marca no ultimatespecs).
 * Puro leitor da BD; não muta nada e não acrescenta dependências.
 */
import { normalizeVehicle } from "../../lib/engine/normalize-vehicle";
import { buildUsCatalog } from "../../lib/engine/us-catalog";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI */
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Distância de edição de Levenshtein (sem dependências) — sobre strings curtas. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL em falta");
  const minAds = Number(arg("--min") ?? "5");

  const { db, closeDb } = await import("../../db");
  const { sql } = await import("drizzle-orm");

  // Famílias do catálogo (chave `${makeSlug}|${family}`) — o alvo do matching.
  const catalog = await buildUsCatalog(db);
  const catFamilies = new Set(catalog.byFamily.keys());
  // marca → famílias do catálogo (para a sugestão do vizinho mais próximo)
  const catByMake = new Map<string, string[]>();
  for (const key of catFamilies) {
    const [make, family] = splitKey(key);
    const list = catByMake.get(make) ?? [];
    list.push(family);
    catByMake.set(make, list);
  }

  // Anúncios ativos → família normalizada (make|model). Só os que normalizam
  // (make/model/fuel resolvidos): os que não normalizam são o relatório de
  // não-mapeados do dicionário, não deste (que é sobre famílias já normalizadas).
  const rows = (await db.execute(sql`
    select make_raw, model_raw, fuel_raw, variant, co2
    from listings
    where deleted_at is null
  `)) as unknown as {
    make_raw: string | null;
    model_raw: string | null;
    fuel_raw: string | null;
    variant: string | null;
    co2: number | null;
  }[];

  // família (make|model) → nº de anúncios
  const adFamilies = new Map<string, number>();
  for (const r of rows) {
    const v = normalizeVehicle(r.make_raw, r.model_raw, r.fuel_raw, r.variant, r.co2);
    if (!v) continue;
    const key = `${v.make}|${v.model}`;
    adFamilies.set(key, (adFamilies.get(key) ?? 0) + 1);
  }

  // Gaps: família de anúncio com ≥N anúncios e sem correspondência no catálogo.
  const gaps: { make: string; model: string; n: number; sugestao: string; dist: number }[] = [];
  for (const [key, n] of adFamilies) {
    if (n < minAds || catFamilies.has(key)) continue;
    const [make, model] = splitKey(key);
    const candidatos = catByMake.get(make) ?? [];
    let best = "";
    let bestDist = Number.POSITIVE_INFINITY;
    for (const fam of candidatos) {
      const d = editDistance(model, fam);
      if (d < bestDist || (d === bestDist && fam < best)) {
        bestDist = d;
        best = fam;
      }
    }
    gaps.push({
      make,
      model,
      n,
      sugestao: best ? `${make}|${best}` : "(marca ausente do catálogo)",
      dist: best ? bestDist : -1,
    });
  }
  gaps.sort((a, b) => b.n - a.n || a.make.localeCompare(b.make) || a.model.localeCompare(b.model));

  console.log(
    "alias-gap: famílias de anúncios (normalizeVehicle) sem correspondência no catálogo us_*",
  );
  console.log(
    `critério: ≥${minAds} anúncios ativos · sugestão = família mais próxima da mesma marca (distância de edição)\n`,
  );
  if (!gaps.length) {
    console.log("(sem gaps — todas as famílias de anúncios ≥N têm correspondência no catálogo)");
  } else {
    for (const g of gaps) {
      const sug = g.dist >= 0 ? `${g.sugestao} (dist=${g.dist})` : g.sugestao;
      console.log(
        `  ${`${g.make} | ${g.model}`.padEnd(34)} → ${String(g.n).padStart(4)} anúncios   sugestão: ${sug}`,
      );
    }
  }
  const totalAds = gaps.reduce((s, g) => s + g.n, 0);
  console.log(`\ntotal: ${gaps.length} famílias-gap cobrindo ${totalAds} anúncios ativos`);

  await closeDb();
  process.exit(0);
}

/** Divide a chave `make|family` no primeiro `|` (a família pode conter `|`? não). */
function splitKey(key: string): [string, string] {
  const i = key.indexOf("|");
  return [key.slice(0, i), key.slice(i + 1)];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
