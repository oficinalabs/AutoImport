/**
 * Teste de fumo: a app compilada, a servir, com sessão real.
 *
 * PORQUÊ ISTO EXISTE. Os dois piores bugs do MVP não viviam em nenhuma função
 * testável — viviam na COLA:
 *
 *   1. `app/(app)/pesquisar/page.tsx` chamava `searchListings()` sem argumentos.
 *      A query sabia filtrar; ninguém lhe passava filtros. Procurar "Golf" dava
 *      zero com centenas de Golfs na base.
 *   2. `app/(app)/painel/page.tsx` tinha `<h1>Bom dia, Rui</h1>` escrito à mão.
 *
 * Nenhum teste unitário os apanhava, e nenhum teste de query os apanharia. Este
 * apanha os dois: arranca a app a sério e olha para o HTML que ela devolve.
 *
 * SEM BROWSER. Não há Playwright nem jsdom — é `fetch` e contagem de
 * `data-testid` sobre o HTML. Apanha os mesmos bugs por uma fração do custo, e
 * corre no mesmo runner que o resto (`node:test`).
 *
 * As asserções são sobre `data-testid`, nunca sobre classes ou texto de estilo:
 * um teste que rebenta quando alguém muda uma cor é um teste que se aprende a
 * ignorar.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { dbUrl } from "../../lib/db-url";
import {
  dropDatabases,
  migrate,
  recreateDatabases,
  seed,
  skipUnlessLocalDb,
  withDbName,
} from "../helpers/db";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const DB_URL = dbUrl();
/**
 * Salta-se a si próprio no `pnpm test` — compila a app e arranca um servidor, o
 * que leva ~90 s contra os ~40 s de todo o resto junto. Corre com
 * `pnpm test:smoke`, e no CI num job próprio. Ficar dentro do mesmo glob (em vez
 * de o `test` listar pastas à mão) é de propósito: assim uma pasta de testes
 * nova nunca fica de fora em silêncio.
 */
const skip = !process.env.SMOKE
  ? "teste de fumo saltado — corre com `pnpm test:smoke`"
  : skipUnlessLocalDb("o teste de fumo");
const TEST_DB = "autoimport_smoke_test";

/** Porta própria: 3000 costuma ter um `pnpm dev` em cima. */
const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
/** Pasta de build própria — ver o comentário do `distDir` em next.config.mjs. */
const DIST = ".next-smoke";

const UTILIZADOR = {
  name: "Marta Ferreira",
  email: "smoke@teste.local",
  password: "Sm0ke!Teste2026#",
  standName: "Stand do Fumo",
};

const SOURCE = "44444444-4444-4444-4444-444444444401";
const VM_GOLF = "44444444-4444-4444-4444-444444444411";
const VM_OUTRO = "44444444-4444-4444-4444-444444444412";

let servidor: ChildProcess | null = null;
let cookie = "";
/** stdout+stderr do servidor, para as asserções poderem dizer o que ele viu. */
const logDoServidor: string[] = [];
const ultimasLinhas = (n = 20) => logDoServidor.join("").trim().split("\n").slice(-n).join("\n");

/** Anúncios: 10 Golf + 10 de outro modelo, todos na montra (exato + normal). */
async function seedListings(sql: ReturnType<typeof postgres>) {
  await sql`insert into sources (id, slug, name, country, kind)
            values (${SOURCE}, 'smoke', 'Smoke', 'DE', 'agregador')`;
  await sql`insert into vehicle_models (id, norm_key, make, model, fuel) values
            (${VM_GOLF},  'smoke|golf|diesel',  'smoke', 'golf',  'diesel'),
            (${VM_OUTRO}, 'smoke|astra|diesel', 'smoke', 'astra', 'diesel')`;

  for (let i = 0; i < 20; i++) {
    const golf = i < 10;
    const [row] = await sql`
      insert into listings (
        source_site, external_id, source_id, model_id, make_raw, model_raw, variant,
        year, km, gearbox, fuel, country, price, detail_url, match_confidence,
        first_seen_at, last_seen_at
      ) values (
        'smoke.de', ${`smoke-${i}`}, ${SOURCE}, ${golf ? VM_GOLF : VM_OUTRO},
        'Volkswagen', ${golf ? "Golf" : "Astra"}, ${`2.0 TDI ${i}`},
        2022, ${50_000 + i * 100}, 'Manual', 'diesel', 'DE', ${20_000 + i * 50},
        ${`https://smoke.de/${i}`}, 'exato', now(), now()
      ) returning id`;
    await sql`
      insert into import_cost_estimates (
        listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
        pt_estimated_price, pt_sample_size, pt_confidence, savings, savings_pct,
        verdict, isv_table_year
      ) values (
        ${row.id}, ${20_000 + i * 50}, 1100, 3000, 200, 355, ${25_000 + i * 50},
        ${30_000 + i * 50}, 8, 'normal', 5000, ${20 - i * 0.1}, 'compensa', 2026
      )`;
  }
}

/** Espera que o servidor responda; falha com o que aconteceu, não com timeout seco. */
async function esperarServidor(tentativas = 60): Promise<void> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(BASE, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      /* ainda a arrancar */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`o servidor não respondeu em ${BASE} ao fim de ${tentativas}s`);
}

before(async () => {
  if (skip) return;

  await recreateDatabases(DB_URL as string, TEST_DB);
  const url = withDbName(DB_URL as string, TEST_DB);
  migrate(url);
  seed(url);

  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  try {
    await seedListings(sql);
  } finally {
    await sql.end();
  }

  // As duas apontadas à base de teste: o db/index.ts prefere a WAREHOUSE_URL,
  // mas o resto do código lê a DATABASE_URL.
  const env = {
    ...process.env,
    WAREHOUSE_URL: url,
    DATABASE_URL: url,
    NEXT_DIST_DIR: DIST,
    NEXT_TELEMETRY_DISABLED: "1",
    // Sem isto o Better Auth recusa o pedido vindo de 127.0.0.1:3111.
    BETTER_AUTH_URL: BASE,
    // O CI não tem `.env.local`, e sem segredo o Better Auth devolve 500 ao
    // registo — com corpo vazio, porque a app não vaza detalhe de erro (e faz
    // bem). Um segredo fixo de teste torna isto auto-suficiente: nada aqui
    // assina nada que saia desta base descartável.
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "smoke-test-secret-nao-usar-em-producao",
    NODE_ENV: "production" as const,
  };

  execFileSync("pnpm", ["exec", "next", "build"], { stdio: "pipe", env });
  servidor = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
    env,
    stdio: "pipe",
  });
  // A app nunca devolve detalhe de erro ao cliente (CLAUDE.md), portanto um 500
  // chega aqui como corpo vazio. Sem isto, diagnosticar uma falha no CI é
  // adivinhar — foi o que aconteceu à primeira.
  servidor.stderr?.on("data", (d) => logDoServidor.push(String(d)));
  servidor.stdout?.on("data", (d) => logDoServidor.push(String(d)));
  await esperarServidor();

  // Conta + sessão. O registo exige email verificado, e não há caixa de correio
  // nenhuma neste teste — marca-se na base, que é o que a verificação faria.
  const registo = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify(UTILIZADOR),
  });
  assert.equal(
    registo.status,
    200,
    `registo falhou: ${await registo.text()}\n--- servidor ---\n${ultimasLinhas()}`,
  );

  const sql2 = postgres(url, { prepare: false, onnotice: () => {} });
  try {
    await sql2`update "user" set email_verified = true where email = ${UTILIZADOR.email}`;
  } finally {
    await sql2.end();
  }

  const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: UTILIZADOR.email, password: UTILIZADOR.password }),
  });
  assert.equal(
    login.status,
    200,
    `login falhou: ${await login.clone().text()}\n--- servidor ---\n${ultimasLinhas()}`,
  );
  cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  assert.ok(cookie.includes("session_token"), "não veio cookie de sessão");
});

after(async () => {
  if (skip) return;
  servidor?.kill("SIGTERM");
  await dropDatabases(DB_URL as string, TEST_DB);
});

async function pagina(path: string): Promise<string> {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200, `${path} devolveu ${r.status}`);
  return r.text();
}

const contar = (html: string, testid: string) => html.split(`data-testid="${testid}"`).length - 1;

test("a pesquisa filtra mesmo (o bug P0-1)", { skip, timeout: 300_000 }, async () => {
  const tudo = await pagina("/pesquisar");
  const golf = await pagina("/pesquisar?texto=Golf");
  const nada = await pagina("/pesquisar?texto=xpto-que-nao-existe");

  const nTudo = contar(tudo, "resultado");
  const nGolf = contar(golf, "resultado");

  assert.equal(nTudo, 20, "os 20 anúncios da fixture");
  assert.equal(nGolf, 10, "só os 10 Golf");
  assert.ok(nGolf < nTudo, "filtrar tem de reduzir");
  assert.equal(contar(nada, "resultado"), 0, "um termo inventado não devolve nada");

  // A asserção que apanhava o bug original: antes disto, `q=Golf` dava ZERO
  // porque a página nunca passava o filtro ao servidor.
  assert.ok(nGolf > 0, "procurar por um modelo que existe não pode dar zero");

  // E o contador tem de dizer a verdade, não o tamanho da página.
  assert.ok(tudo.includes('data-testid="total"'), "falta o contador");
  assert.match(golf, /data-testid="total"[^>]*>[\s\S]{0,80}?10/, "o total do Golf é 10");
});

test("o painel cumprimenta quem está com sessão (o bug P1-1)", { skip }, async () => {
  const html = await pagina("/painel");
  assert.ok(html.includes("Marta"), "tem de usar o nome da sessão");
  assert.ok(!html.includes("Bom dia, Rui"), "o nome não pode estar escrito à mão");
});

test("sem sessão, a app manda para o login", { skip }, async () => {
  const r = await fetch(`${BASE}/painel`, { redirect: "manual" });
  assert.equal(r.status, 307);
  assert.match(r.headers.get("location") ?? "", /\/entrar/);
});
