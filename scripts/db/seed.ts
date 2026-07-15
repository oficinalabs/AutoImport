/**
 * Seed de desenvolvimento — idempotente (upsert por chave natural).
 *   pnpm db:seed
 * Popula: `sources` (fontes com coletor) e `isv_tables` (tabelas fiscais 2026).
 * Corre com tsx (imports de db/ e drizzle não passam no type-stripping do Node).
 */

// O tsx (ao contrário do Next) não carrega o .env.local sozinho — e tem de
// acontecer ANTES de importar db/ (o cliente postgres lê a env ao ser criado),
// daí os imports dinâmicos dentro de main().
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local (ex.: CI) — as variáveis vêm do ambiente.
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL em falta — correr `pnpm db:up` e definir no .env.local");
  }

  const { db } = await import("../../db");
  const { isvTables, sources } = await import("../../db/schema");
  const { ISV_TABLES_2026 } = await import("../../db/seed/isv-2026");
  const { SOURCES } = await import("../../db/seed/sources");

  for (const s of SOURCES) {
    await db
      .insert(sources)
      .values({ slug: s.slug, name: s.name, country: s.country, kind: s.kind })
      .onConflictDoUpdate({
        target: sources.slug,
        set: { name: s.name, country: s.country, kind: s.kind },
      });
  }
  console.log(`sources: ${SOURCES.length} upserted`);

  for (const t of ISV_TABLES_2026) {
    await db
      .insert(isvTables)
      .values({ year: t.year, kind: t.kind, payload: t.payload, sourceUrl: t.sourceUrl })
      .onConflictDoUpdate({
        target: [isvTables.year, isvTables.kind],
        set: { payload: t.payload, sourceUrl: t.sourceUrl },
      });
  }
  console.log(`isv_tables: ${ISV_TABLES_2026.length} upserted`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
