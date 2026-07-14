/**
 * Batch diário — orquestrador sequencial do pipeline completo:
 *   ingest NDJSON → match-models → pt-market → soft-delete de desaparecidos
 *   → compute-costs → flag-opportunities
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

  console.log("── 1/6 ingest ──");
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

  console.log("── 2/6 match-models ──");
  const match = await matchModels();

  console.log("── 3/6 pt-market ──");
  await collectPtObservations();

  console.log("── 4/6 desaparecidos ──");
  const stale = (await db.execute(sql`
    update listings set deleted_at = now()
    where deleted_at is null
      and last_seen_at < now() - make_interval(days => ${staleDays})
    returning id
  `)) as unknown as { id: string }[];
  console.log(`soft-delete: ${stale.length} anúncios sem sinal há ${staleDays}+ dias`);

  console.log("── 5/6 compute-costs ──");
  const costs = await computeCosts();

  console.log("── 6/6 flag-opportunities ──");
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
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
