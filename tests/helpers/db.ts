/**
 * Primitivas partilhadas pelos testes que precisam de uma base DESCARTÁVEL.
 *
 * Estavam duplicadas em tests/pipeline/integration.test.ts e publish.test.ts, e
 * o terceiro consumidor (tests/queries) seria a terceira cópia. Aqui não há
 * fixtures nem limpezas — isso é específico de cada teste; só o que é mesmo
 * infraestrutura: escolher a base, criá-la, migrá-la, deitá-la fora.
 *
 * ⚠️ Este ficheiro NÃO pode chamar-se `*.test.ts` — o glob do `pnpm test`
 * (`tests/ (asterisco) / (asterisco) .test.ts`) apanhá-lo-ia como suite.
 *
 * ⚠️ NUNCA importar `db/` aqui. `db/index.ts` resolve a connection string no
 * momento do import; os testes definem `process.env.WAREHOUSE_URL` **antes** de
 * fazerem `await import("../../db")`, e um import estático a partir daqui
 * quebrava essa ordem em silêncio.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { dbUrl, isLocalDbUrl } from "../../lib/db-url";

/**
 * Motivo para saltar, ou `false` para correr. Guarda anti-produção: estes testes
 * ESCREVEM (criam e apagam bases) e a `DATABASE_URL` pode apontar para a Supabase
 * real — correr `pnpm test` com ela carregada já deixou resíduos na montra.
 * Só corre contra Postgres LOCAL (warehouse, docker `pnpm db:up` ou o CI).
 *
 * @param what como o teste se descreve na mensagem ("teste de integração", …)
 */
export function skipUnlessLocalDb(what: string): string | false {
  const url = dbUrl();
  if (!url) return `sem base de dados — ${what} saltado`;
  if (!isLocalDbUrl(url))
    return `base de dados não é local — ${what} escreve; só warehouse/docker/CI`;
  return false;
}

/** A mesma URL a que o `db` ligaria, com outro nome de base. */
export function withDbName(baseUrl: string, name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Corre `fn` ligado à base `postgres` (a única de onde se pode criar/apagar outras). */
export async function withAdmin(
  baseUrl: string,
  fn: (sql: ReturnType<typeof postgres>) => Promise<void>,
): Promise<void> {
  const sql = postgres(withDbName(baseUrl, "postgres"), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  });
  try {
    await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Apaga (se existir) e recria as bases indicadas. */
export async function recreateDatabases(baseUrl: string, ...names: string[]): Promise<void> {
  await withAdmin(baseUrl, async (sql) => {
    for (const name of names) {
      await sql.unsafe(`drop database if exists ${name} with (force)`).simple();
      await sql.unsafe(`create database ${name}`).simple();
    }
  });
}

/** Apaga as bases indicadas; usado no `after()`. */
export async function dropDatabases(baseUrl: string, ...names: string[]): Promise<void> {
  await withAdmin(baseUrl, async (sql) => {
    for (const name of names) {
      await sql.unsafe(`drop database if exists ${name} with (force)`).simple();
    }
  });
}

/** Clona uma base a partir de outra já migrada — evita uma segunda migração. */
export async function cloneDatabase(baseUrl: string, from: string, to: string): Promise<void> {
  await withAdmin(baseUrl, async (sql) => {
    await sql.unsafe(`create database ${to} template ${from}`).simple();
  });
}

/** Env que aponta ambas as variáveis à base de teste (o warehouse ganha, mas os
 *  subprocessos podem ler qualquer uma delas). */
const envFor = (url: string) => ({ ...process.env, WAREHOUSE_URL: url, DATABASE_URL: url });

/** Aplica as migrations versionadas na base indicada. */
export function migrate(url: string): void {
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], { stdio: "pipe", env: envFor(url) });
}

/** Corre o seed (tabelas de ISV, sources…) na base indicada. */
export function seed(url: string): void {
  execFileSync("pnpm", ["exec", "tsx", "scripts/db/seed.ts"], { stdio: "pipe", env: envFor(url) });
}
