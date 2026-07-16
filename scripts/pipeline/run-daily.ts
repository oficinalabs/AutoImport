/**
 * Batch diário — orquestrador sequencial do pipeline completo:
 *   ingest NDJSON → precio al contado (ES) → match-models → pt-market →
 *   soft-delete de desaparecidos → compute-costs → flag-opportunities
 *   pnpm pipeline:daily [--dir tools/collector/out] [--stale-days 14]
 * Cada passo loga o seu sumário; no fim sai o painel de saúde do matching.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL em falta — correr `pnpm db:up` e definir no .env.local");
  }
  const dir = arg("--dir", "tools/collector/out");
  const staleDays = Number(arg("--stale-days", "14"));

  console.log("── 1/7 ingest ──");
  if (existsSync(dir)) {
    // processo separado: o ingest gere a própria ligação/saída
    execFileSync("pnpm", ["exec", "tsx", "scripts/pipeline/ingest.ts", "--dir", dir], {
      stdio: "inherit",
    });
  } else {
    console.log(`(sem ${dir} — passo saltado)`);
  }

  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const { matchModels } = await import("./match-models");
  const { collectPtObservations } = await import("./pt-market");
  const { computeCosts } = await import("./compute-costs");
  const { flagOpportunities } = await import("./flag-opportunities");
  const { enrichEs } = await import("./enrich-es");

  console.log("── 2/7 precio al contado (ES) ──");
  await enrichEs();

  console.log("── 3/7 match-models ──");
  const match = await matchModels();

  console.log("── 4/7 pt-market ──");
  await collectPtObservations();

  console.log("── 5/7 desaparecidos ──");
  const stale = (await db.execute(sql`
    update listings set deleted_at = now()
    where deleted_at is null
      and last_seen_at < now() - make_interval(days => ${staleDays})
    returning id
  `)) as unknown as { id: string }[];
  console.log(`soft-delete: ${stale.length} anúncios sem sinal há ${staleDays}+ dias`);

  console.log("── 6/7 compute-costs ──");
  const costs = await computeCosts();

  console.log("── 7/7 flag-opportunities ──");
  const opps = await flagOpportunities();

  // Painel de saúde do pipeline (métricas de qualidade do matching)
  const [health] = (await db.execute(sql`
    select
      count(*) filter (where deleted_at is null) as ativos,
      count(*) filter (where deleted_at is null and model_id is not null) as com_modelo,
      count(*) filter (where deleted_at is null and country != 'PT') as estrangeiros,
      (select count(*) from import_cost_estimates) as estimativas,
      (select round(avg(pt_sample_size)) from import_cost_estimates) as amostra_media,
      (select count(*) from opportunities where deleted_at is null) as oportunidades
    from listings
  `)) as unknown as Record<string, string>[];
  console.log("\n── saúde do pipeline ──");
  console.log(
    `ativos ${health.ativos} · com modelo ${health.com_modelo} (${Math.round((Number(health.com_modelo) / Math.max(1, Number(health.ativos))) * 100)}%) · estrangeiros ${health.estrangeiros}`,
  );
  console.log(
    `estimativas ${health.estimativas} · amostra PT média ${health.amostra_media ?? "—"} · oportunidades ativas ${health.oportunidades}`,
  );
  console.log(
    `match novo: ${match.matched}/${match.total} · custos: ${JSON.stringify(costs.verdicts)} · opps ativas ${opps.flagged}`,
  );

  await versionHealthPanel(db, sql);
  process.exit(0);
}

/**
 * Painel de saúde do matching de versão (Fase 3/4): distribuição por tier do
 * resolver estrito — global e por fonte (top-8) — mais a proveniência de catálogo
 * das estimativas. O top-20 de anúncios com potência mas sem confirmado (os alvos
 * para alargar o catálogo/dicionário) é impresso pelo passo 3/7 (match-models) —
 * este bloco fecha o painel com os totais. Exportado para correr isolado.
 */
export async function versionHealthPanel(
  db: typeof import("../../db").db,
  sql: typeof import("drizzle-orm").sql,
) {
  const verSrc = (await db.execute(sql`
    select source_site,
      count(*) filter (where match_confidence = 'confirmado')::int as confirmado,
      count(*) filter (where match_confidence = 'provavel')::int as provavel,
      count(*) filter (where match_confidence is null)::int as sem_match,
      count(*)::int as ativos
    from listings where deleted_at is null
    group by source_site
    order by ativos desc
  `)) as unknown as {
    source_site: string;
    confirmado: number;
    provavel: number;
    sem_match: number;
    ativos: number;
  }[];
  const g = verSrc.reduce(
    (acc, r) => {
      acc.confirmado += r.confirmado;
      acc.provavel += r.provavel;
      acc.sem_match += r.sem_match;
      acc.ativos += r.ativos;
      return acc;
    },
    { confirmado: 0, provavel: 0, sem_match: 0, ativos: 0 },
  );
  const p = (n: number) => (g.ativos ? Math.round((n / g.ativos) * 1000) / 10 : 0);
  const [prov] = (await db.execute(sql`
    select count(*)::int as total,
      count(*) filter (where inputs->>'versionId' is not null)::int as com_versao,
      count(*) filter (where jsonb_array_length(coalesce(inputs->'fromCatalog', '[]'::jsonb)) > 0)::int as com_specs
    from import_cost_estimates
  `)) as unknown as { total: number; com_versao: number; com_specs: number }[];

  console.log("\n── saúde do matching de versão ──");
  console.log(
    `global: confirmado ${g.confirmado} (${p(g.confirmado)}%) · provável ${g.provavel} (${p(g.provavel)}%) · sem match ${g.sem_match} (${p(g.sem_match)}%) · de ${g.ativos} ativos`,
  );
  console.log("por fonte (top-8, % sobre ativos da fonte):");
  for (const r of verSrc.slice(0, 8)) {
    const ps = (n: number) => (r.ativos ? Math.round((n / r.ativos) * 1000) / 10 : 0);
    console.log(
      `  ${r.source_site.padEnd(20)} conf ${ps(r.confirmado)}% · prov ${ps(r.provavel)}% · null ${ps(r.sem_match)}% (${r.ativos})`,
    );
  }
  console.log(
    `estimativas: ${prov.total} · com versão do catálogo ${prov.com_versao} · com specs efetivas do catálogo ${prov.com_specs}`,
  );
}

// Executável direto (o painel é importável isoladamente — ver versionHealthPanel).
if (process.argv[1]?.endsWith("run-daily.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
