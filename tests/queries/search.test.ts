/**
 * Testes da PESQUISA (lib/queries.ts → searchListingsQuery) contra uma base
 * descartável. É a primeira vez que a camada de queries da app é testada, e é
 * onde o bloqueador do MVP vivia: os filtros corriam em memória sobre 60 linhas
 * fixas, portanto procurar "Golf" dava zero com 900 Golfs na montra.
 *
 * A fixture é toda sintética ("Testsearch") e minúscula — o que interessa aqui
 * não são vereditos, é o SQL: cada filtro reduz e nunca deixa passar algo que o
 * viole, o dedupe deixa um representante por carro, e a paginação não salta nem
 * repete.
 *
 * ⚠️ `process.env.WAREHOUSE_URL` tem de ser definido ANTES de qualquer
 * `await import("../../lib/queries")`: o db/index.ts congela a connection string
 * no import. Por isso os módulos são importados dentro dos testes.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { dbUrl } from "../../lib/db-url";
import {
  dropDatabases,
  migrate,
  recreateDatabases,
  skipUnlessLocalDb,
  withDbName,
} from "../helpers/db";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const DB_URL = dbUrl();
const skip = skipUnlessLocalDb("o teste da pesquisa");
const TEST_DB = "autoimport_search_test";

const SOURCE = "33333333-3333-3333-3333-333333333301";
const VM_GOLF = "33333333-3333-3333-3333-333333333311";
const VM_ASTRA = "33333333-3333-3333-3333-333333333312";

/**
 * A fixture. Todos passam a regra da montra (`exato` + `normal`) para que o que
 * o teste mede seja o filtro, não a elegibilidade.
 *
 * Os dois `dup-` partilham VIN de propósito: são o mesmo carro cross-listado, e
 * só o de maior savings pode aparecer.
 */
const FIXTURE = [
  // ext        país  ano    km      caixa       combustível  totalPt  savings  pct   verdict         vin
  ["golf-de", "DE", 2022, 40_000, "Automatik", "diesel", 25_000, 5_000, 20, "compensa", null],
  ["golf-fr", "FR", 2019, 120_000, "Manuelle", "gasolina", 12_000, 400, 3, "marginal", null],
  ["astra-de", "DE", 2023, 10_000, null, "elétrico", 30_000, 9_000, 30, "compensa", null],
  ["astra-es", "ES", 2021, 80_000, "Manual", "diesel", 18_000, 1_000, 5, "marginal", null],
  [
    "dup-alto",
    "DE",
    2022,
    50_000,
    "Manual",
    "diesel",
    20_000,
    7_000,
    35,
    "compensa",
    "WVWZZZ1KZAW000001",
  ],
  [
    "dup-baixo",
    "BE",
    2022,
    51_000,
    "Manual",
    "diesel",
    21_000,
    2_000,
    9,
    "compensa",
    "WVWZZZ1KZAW000001",
  ],
] as const;

async function seedFixture(sql: ReturnType<typeof postgres>) {
  await sql`insert into sources (id, slug, name, country, kind)
            values (${SOURCE}, 'testsearch', 'TestSearch', 'DE', 'agregador')
            on conflict do nothing`;
  for (const [id, model] of [
    [VM_GOLF, "golf"],
    [VM_ASTRA, "astra"],
  ] as const) {
    await sql`insert into vehicle_models (id, norm_key, make, model, fuel)
              values (${id}, ${`testsearch|${model}|diesel`}, 'testsearch', ${model}, 'diesel')
              on conflict do nothing`;
  }

  // Enchimento para a paginação ser real: 30 anúncios em NL, com savings_pct
  // entre 1,00 e 1,29 — sempre abaixo dos 3% do `golf-fr`, portanto sempre
  // DEPOIS da fixture principal na ordenação por omissão.
  //
  // ⚠️ O PREÇO tem de variar. Sem VIN, a identidade de carro físico é
  // `model_id:ano:km(milhares):preço` (lib/engine/car-identity.ts) — 30 linhas
  // com os quatro iguais são o MESMO carro e o dedupe colapsava-as numa só.
  // (Foi o que aconteceu à primeira: o total dava 6 em vez de 35.)
  const enchimento = Array.from({ length: 30 }, (_, i) => [
    `filler-${String(i).padStart(2, "0")}`,
    "NL" as const,
    2020,
    90_000,
    "Manual",
    "gasolina",
    9_000 + i * 10,
    100,
    1 + i / 100,
    "nao_compensa",
    null,
  ]) as unknown as typeof FIXTURE;

  for (const [ext, country, year, km, gearbox, fuel, totalPt, savings, pct, verdict, vin] of [
    ...FIXTURE,
    ...enchimento,
  ]) {
    const modelId = ext.startsWith("golf") ? VM_GOLF : VM_ASTRA;
    const [row] = await sql`
      insert into listings (
        source_site, external_id, source_id, model_id, make_raw, model_raw, variant,
        year, km, gearbox, fuel, country, price, detail_url, vin,
        match_confidence, first_seen_at, last_seen_at
      ) values (
        'testsearch.de', ${`search-${ext}`}, ${SOURCE}, ${modelId},
        'Testsearch', ${ext.startsWith("golf") ? "Golf" : "Astra"}, ${`${ext} 2.0 TDI`},
        ${year}, ${km}, ${gearbox}, ${fuel}, ${country}, ${totalPt - 5000},
        ${`https://testsearch.de/${ext}`}, ${vin},
        'exato', now(), now()
      ) returning id`;
    await sql`
      insert into import_cost_estimates (
        listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
        pt_estimated_price, pt_sample_size, pt_confidence, savings, savings_pct,
        verdict, isv_table_year
      ) values (
        ${row.id}, ${totalPt - 5000}, 1000, 3000, 200, 355, ${totalPt},
        ${totalPt + savings}, 8, 'normal', ${savings}, ${pct}, ${verdict}, 2026
      )`;
  }
}

let sql: ReturnType<typeof postgres> | null = null;

before(async () => {
  if (skip) return;
  await recreateDatabases(DB_URL as string, TEST_DB);
  const url = withDbName(DB_URL as string, TEST_DB);
  migrate(url);
  process.env.WAREHOUSE_URL = url;
  sql = postgres(url, { prepare: false, onnotice: () => {} });
  await seedFixture(sql);
});

after(async () => {
  if (skip) return;
  await sql?.end();
  const { closeDb } = await import("../../db");
  await closeDb();
  await dropDatabases(DB_URL as string, TEST_DB);
});

/** Os external_id (sem prefixo) devolvidos por uns filtros, por ordem. */
async function procurar(filters: Record<string, unknown> = {}) {
  const { searchListingsQuery } = await import("../../lib/queries");
  const page = await searchListingsQuery(filters, null);
  return {
    ids: page.items.map((l) => l.sourceUrl?.replace("https://testsearch.de/", "") ?? "?"),
    total: page.total,
    hasMore: page.hasMore,
    page: page.page,
  };
}

/** Total da fixture: 6 anúncios − 1 duplicado + 30 de enchimento. */
const TOTAL = 35;
/** Os 4 países da fixture principal — para isolar do enchimento (NL). */
const PRINCIPAIS = ["DE", "ES", "FR", "BE"] as const;

test("sem filtros: um representante por carro, ordenado por poupança %", { skip }, async () => {
  const r = await procurar();
  // 36 anúncios, mas `dup-alto` e `dup-baixo` são o mesmo carro (VIN igual).
  assert.equal(r.total, TOTAL, "o dedupe conta carros, não anúncios");
  assert.ok(r.ids.includes("dup-alto"), "fica o de maior savings do par");
  assert.ok(!r.ids.includes("dup-baixo"), "o duplicado de menor savings sai");
  assert.deepEqual(
    r.ids.slice(0, 5),
    ["dup-alto", "astra-de", "golf-de", "astra-es", "golf-fr"],
    "por savings_pct desc: 35, 30, 20, 5, 3 — o enchimento (≤1,3) vem depois",
  );
});

test("ordenar por poupança absoluta é diferente de por percentagem", { skip }, async () => {
  const { ids } = await procurar({ sort: "savings" });
  assert.deepEqual(ids.slice(0, 5), ["astra-de", "dup-alto", "golf-de", "astra-es", "golf-fr"]);
});

test("texto: procura no anúncio e por tokens", { skip }, async () => {
  assert.deepEqual((await procurar({ query: "golf" })).ids.sort(), ["golf-de", "golf-fr"]);
  // Tokens: "testsearch golf" tem de casar mesmo estando em colunas diferentes
  // (make_raw + model_raw). Com o `%frase inteira%` de antes dava zero.
  assert.deepEqual((await procurar({ query: "testsearch golf" })).ids.sort(), [
    "golf-de",
    "golf-fr",
  ]);
  assert.equal((await procurar({ query: "naoexiste" })).total, 0);
});

test("país, veredito e preço filtram em SQL", { skip }, async () => {
  assert.deepEqual((await procurar({ countries: ["FR"] })).ids, ["golf-fr"]);
  assert.deepEqual((await procurar({ countries: ["FR", "ES"] })).ids.sort(), [
    "astra-es",
    "golf-fr",
  ]);
  const opp = await procurar({ onlyOpportunities: true });
  assert.deepEqual(opp.ids.sort(), ["astra-de", "dup-alto", "golf-de"]);
  assert.deepEqual(
    (await procurar({ maxPrice: 18_000, countries: ["ES", "FR"] })).ids.sort(),
    ["astra-es", "golf-fr"],
    "o `lte` inclui o valor exato (astra-es custa 18 000)",
  );
});

test("ano, km e combustível filtram em SQL", { skip }, async () => {
  assert.deepEqual((await procurar({ minYear: 2023 })).ids, ["astra-de"]);
  assert.deepEqual((await procurar({ maxKm: 30_000 })).ids, ["astra-de"]);
  assert.deepEqual((await procurar({ fuel: "elétrico" })).ids, ["astra-de"]);
  // Acentos: o valor da UI tem de bater byte-a-byte com o que está em BD.
  assert.equal((await procurar({ fuel: "diesel" })).total, 3);
});

test("caixa: 'manual' inclui os anúncios sem caixa conhecida", { skip }, async () => {
  // A armadilha. `transmissionOf` (o que decide o CARTÃO) trata gearbox null
  // como "manual"; um `not ilike '%auto%'` cru excluía-o e o filtro passava a
  // contradizer o cartão. `astra-de` tem gearbox null.
  const paises = [...PRINCIPAIS];
  const manual = await procurar({ gearbox: "manual", countries: paises });
  assert.ok(manual.ids.includes("astra-de"), "sem caixa conhecida conta como manual");
  assert.deepEqual(manual.ids.sort(), ["astra-de", "astra-es", "dup-alto", "golf-fr"]);

  const auto = await procurar({ gearbox: "automática", countries: paises });
  assert.deepEqual(auto.ids, ["golf-de"], "só o Automatik");
  assert.equal(manual.total + auto.total, 5, "as duas caixas somam a montra toda");
});

test("filtros combinam-se (AND), não se substituem", { skip }, async () => {
  const r = await procurar({ countries: ["DE"], fuel: "diesel", minYear: 2022 });
  assert.deepEqual(r.ids.sort(), ["dup-alto", "golf-de"]);
});

test("paginação: não salta nem repete, e o total é do conjunto todo", { skip }, async () => {
  const { searchListingsQuery, PAGE_SIZE } = await import("../../lib/queries");
  assert.equal(PAGE_SIZE, 24);

  const p1 = await searchListingsQuery({}, null);
  const p2 = await searchListingsQuery({ page: 2 }, null);

  assert.equal(p1.items.length, PAGE_SIZE);
  assert.equal(p2.items.length, TOTAL - PAGE_SIZE);
  assert.equal(p1.total, TOTAL, "o total é o do conjunto, não o da página");
  assert.equal(p2.total, TOTAL, "e não muda de página para página");
  assert.equal(p1.hasMore, true);
  assert.equal(p2.hasMore, false);

  const ids1 = new Set(p1.items.map((l) => l.id));
  const repetidos = p2.items.filter((l) => ids1.has(l.id));
  assert.deepEqual(repetidos, [], "a página 2 não pode repetir carros da 1");
  assert.equal(ids1.size + p2.items.length, TOTAL, "juntas, as duas páginas dão o conjunto todo");
});

test("páginas fora do conjunto não mentem no total", { skip }, async () => {
  const { searchListingsQuery } = await import("../../lib/queries");

  // O `count(*) over()` viaja nas linhas: numa página vazia não vinha nenhuma e
  // o total dava 0 — quem aterrasse aqui via "0 anúncios" e ficava sem
  // paginação com que voltar atrás.
  const vazia = await searchListingsQuery({ page: 3 }, null);
  assert.equal(vazia.items.length, 0);
  assert.equal(vazia.total, TOTAL, "o total continua a ser o verdadeiro");

  // Fora do teto fica presa ao teto, não rebenta nem faz um offset absurdo.
  const fundo = await searchListingsQuery({ page: 10_000 }, null);
  assert.equal(fundo.page, 200);
  assert.equal(fundo.items.length, 0);

  // Página 0 / negativa não vira offset negativo.
  assert.equal((await searchListingsQuery({ page: 0 }, null)).page, 1);
  assert.equal((await searchListingsQuery({ page: -5 }, null)).page, 1);
});

test("a ordem é total — duas corridas dão exatamente a mesma sequência", { skip }, async () => {
  // Sem o `id` como último critério, linhas com valor igual podiam trocar de
  // posição entre pedidos e a paginação saltava carros em silêncio. O
  // enchimento tem 30 linhas com savings idêntico (100) — é exatamente o caso.
  for (const sort of ["percentagem", "savings", "recent", "price"] as const) {
    const a = await procurar({ sort });
    const b = await procurar({ sort });
    assert.deepEqual(a.ids, b.ids, `ordenação '${sort}' não é determinística`);
  }
});
