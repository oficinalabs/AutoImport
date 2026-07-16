/**
 * Harness de avaliação — corre o pipeline e escreve um snapshot JSON
 * determinístico das métricas de saúde (scripts/eval/metrics.ts).
 *
 *   pnpm exec tsx scripts/eval/run-eval.ts --out scripts/eval/baselines/01-baseline.json \
 *     [--ingest <dir>] [--source standvirtual,aramisauto]
 *
 * --ingest re-corre o ingest dos NDJSON (upsert idempotente) antes do pipeline;
 * --source limita o re-ingest às fontes indicadas (nomes de ficheiro, ex.:
 * "standvirtual"). Sem --ingest, corre só os passos do pipeline sobre o estado
 * atual da BD. O ingest é reutilizado como subprocesso (igual ao run-daily.ts,
 * que é um script, não um módulo importável); os restantes passos são
 * importados como funções.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL em falta — correr `pnpm db:up` e definir no .env.local");
  }
  const out = arg("--out");
  if (!out) throw new Error("--out <ficheiro.json> em falta");
  const ingestDir = arg("--ingest");
  const sources = arg("--source")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ingestDir) {
    const targets = sources ?? [undefined];
    for (const src of targets) {
      const args = ["exec", "tsx", "scripts/pipeline/ingest.ts", "--dir", ingestDir];
      if (src) args.push("--source", src);
      console.log(`── ingest ${src ?? "(todas as fontes)"} ──`);
      execFileSync("pnpm", args, { stdio: "inherit" });
    }
  }

  const { db, closeDb } = await import("../../db");
  const { matchModels } = await import("../pipeline/match-models");
  const { collectPtObservations } = await import("../pipeline/pt-market");
  const { computeCosts } = await import("../pipeline/compute-costs");
  const { flagOpportunities } = await import("../pipeline/flag-opportunities");
  const { computeSnapshot } = await import("./metrics");

  console.log("── match-models ──");
  await matchModels();
  console.log("── pt-market ──");
  await collectPtObservations();
  console.log("── compute-costs ──");
  await computeCosts();
  console.log("── flag-opportunities ──");
  await flagOpportunities();

  const snapshot = await computeSnapshot(db);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\nsnapshot escrito em ${out}`);
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
