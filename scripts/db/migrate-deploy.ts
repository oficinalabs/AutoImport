/**
 * Migrations no deploy (Vercel).
 *
 * Corre antes do `next build` para a base de dados nunca ficar atrás do código
 * — foi exatamente isso que partiu a produção quando o painel passou a ler
 * `listings` sem a tabela existir.
 *
 * Guardas:
 * - Só corre quando VERCEL_ENV=production. Previews de PR NÃO aplicam
 *   migrations (senão um PR por rever alterava a base de dados de produção,
 *   já que Preview e Production partilham a mesma DATABASE_URL).
 * - Sem DATABASE_URL não faz nada (build de demonstração com dados mock).
 *
 * Ver docs/05-INFRA-E-DEPLOY.md.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const vercelEnv = process.env.VERCEL_ENV;
const databaseUrl = process.env.DATABASE_URL;

async function main() {
  if (!databaseUrl) {
    console.log("[migrate-deploy] sem DATABASE_URL — nada a fazer (build sobre mocks).");
    return;
  }

  // Em previews/dev não tocamos na base de dados partilhada.
  if (vercelEnv && vercelEnv !== "production") {
    console.log(
      `[migrate-deploy] VERCEL_ENV=${vercelEnv} — migrations ignoradas (só em produção).`,
    );
    return;
  }

  console.log("[migrate-deploy] a aplicar migrations pendentes…");

  // max: 1 — uma ligação dedicada; o pooler do Supabase não gosta de DDL em paralelo.
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./db/migrations" });
    console.log("[migrate-deploy] ✓ migrations aplicadas.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Falhar o build é intencional: melhor não publicar do que publicar código
  // que a base de dados não suporta.
  console.error("[migrate-deploy] ✗ falha ao aplicar migrations:", error);
  process.exit(1);
});
