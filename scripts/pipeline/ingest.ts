/**
 * Ingestão por replay dos NDJSON dos coletores para o Postgres.
 *   pnpm exec tsx scripts/pipeline/ingest.ts [--dir tools/collector/out] [--source autoscout24]
 * Idempotente: o upsert (db-sink) conflita na chave natural (source_site,
 * external_id) — re-correr não duplica. Cobre os crawls batch (que escrevem
 * NDJSON direto), o coletor Python (piscapisca) e artefactos do CI.
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis vêm do ambiente */
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    dir: get("--dir") ?? "tools/collector/out",
    source: get("--source"),
  };
}

/** "autoscout24-2026-07-13T…ndjson" | "autoscout24-events.ndjson" → "autoscout24" */
function sourceNameOf(file: string): string {
  return basename(file, ".ndjson")
    .replace(/-events$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}T.*$/, "");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL em falta — correr `pnpm db:up` e definir no .env.local");
  }
  const { DbSink } = await import("../../tools/collector/lib/db-sink");
  const db = new DbSink(process.env.DATABASE_URL);

  const { dir, source } = parseArgs();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ndjson"))
    .filter((f) => !source || sourceNameOf(f) === source)
    .sort(); // batch antes de events (ordem alfabética: timestamp < "events")

  let totalRows = 0;
  let totalErrors = 0;
  for (const file of files) {
    const sourceName = sourceNameOf(file);
    const lines = readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean);
    let ok = 0;
    let errors = 0;
    for (const line of lines) {
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line);
      } catch {
        errors++;
        continue;
      }
      const { event: rawEvent, ...rest } = record;
      const event = rawEvent === "price_change" ? "price_change" : "new";
      try {
        await db.upsertListing(rest, event, sourceName);
        ok++;
      } catch (err) {
        if (++errors <= 3) console.error(`  ✗ ${file}: ${(err as Error).message}`);
      }
    }
    totalRows += ok;
    totalErrors += errors;
    console.log(`${file}: ${ok} upserted${errors ? ` · ${errors} erros` : ""}`);
  }

  await db.close();
  console.log(`\ningest: ${files.length} ficheiros · ${totalRows} registos · ${totalErrors} erros`);
  if (files.length === 0) console.log(`(nada para ingerir em ${dir})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
