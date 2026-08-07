/**
 * A pesquisa do lado do SERVIDOR (`searchListingsQuery`), contra uma Postgres
 * LOCAL descartável — mesmo padrão do publish.test.ts / pt-market.test.ts: base
 * criada do zero, migrada com o drizzle-kit, apagada no fim.
 *
 * Porquê base a sério: o que aqui pode partir é SQL — o `count(*) over ()` que
 * dá o total antes do LIMIT, o `concat_ws` do texto livre, o `~*` da caixa e a
 * coerência com o `MONTRA_REPRESENTANTE` (o NOT EXISTS que desduplica carros).
 * Nada disto se prova com um duplo do `db`.
 *
 * A fixture é sintética ("Pesqmarke"/"Enchimarke") e tem 60 anúncios de
 * enchimento de propósito: sem passar do `PAGE_SIZE`, "o total é o total"
 * e "o total é o tamanho da página" seriam a mesma asserção.
 *
 * Sem Postgres local (ou sem permissão para criar bases) o teste salta.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import postgres from "postgres";
import type { SearchFilters } from "../../lib/data";
import { dbUrl, isLocalDbUrl } from "../../lib/db-url";
import { normGearbox } from "../../lib/engine/us-catalog";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const LOCAL = dbUrl();
const skip = !LOCAL
  ? "sem base de dados — teste da pesquisa saltado"
  : !isLocalDbUrl(LOCAL)
    ? "base de dados não é local — este teste cria uma base de teste; só local"
    : false;

const TEST_DB = "autoimport_search_test";
const withDbName = (name: string) => {
  const url = new URL(LOCAL);
  url.pathname = `/${name}`;
  return url.toString();
};

type Sql = ReturnType<typeof postgres>;

/** Página do servidor (lib/queries.ts) — o que faz valer os 60 de enchimento. */
const PAGE_SIZE = 24;
const ENCHIMENTO = 60;

const VM = {
  gasolina: "44444444-4444-4444-4444-444444444401",
  diesel: "44444444-4444-4444-4444-444444444402",
  hibrido: "44444444-4444-4444-4444-444444444403",
  eletrico: "44444444-4444-4444-4444-444444444404",
  enchimento: "44444444-4444-4444-4444-444444444405",
};

/** Cross-listing: o `s-clone` é o MESMO carro físico do `s-catalogo`. */
const VIN = "WP1AB2CD3EF456789";

/** O título que o cartão mostra para o `s-catalogo` — marca do us_models +
 *  nome da versão sem o código de chassis (`cleanVersionName`: "Q16 " sai). */
const TITULO_DO_CATALOGO = "Pesqmarke Pquatro Gran Coupe 840d";

/** Anúncio da fixture: só o que varia; o resto é o mesmo carro. */
function carro(externalId: string, over: Record<string, unknown> = {}) {
  const base = {
    source_site: "autoscout24.de",
    external_id: externalId,
    model_id: VM.gasolina,
    make_raw: "Pesqmarke",
    model_raw: "P4",
    variant: "840d xDrive",
    year: 2023,
    km: 20_000,
    fuel: "gasolina",
    gearbox: "Manual",
    country: "DE",
    price: 15_000,
    vin: null,
    detail_url: `https://ex.test/${externalId}`,
    us_version_id: "PQ-V1",
    match_confidence: "exato",
    ...over,
  };
  // A coluna normalizada é escrita pelo `match-models` com este mesmo
  // `normGearbox` — a fixture usa-o para não codificar uma segunda verdade
  // sobre a caixa (ver a migration 0008).
  return { ...base, gearbox_norm: normGearbox(base.gearbox as string | null) };
}

function estimativa(listingId: string, over: Record<string, unknown> = {}) {
  return {
    listing_id: listingId,
    origin_price: 15_000,
    transport: 900,
    isv: 3_000,
    iuc: 200,
    legalization: 400,
    total_pt: 20_000,
    pt_estimated_price: 25_000,
    pt_sample_size: 8,
    pt_confidence: "normal",
    savings: 5_000,
    savings_pct: 25,
    verdict: "compensa",
    isv_table_year: 2026,
    ...over,
  };
}

/**
 * Os anúncios com nome. Os quatro primeiros são a montra visível — um por
 * combustível/caixa/país/ano/km, para cada filtro poder isolar exatamente um.
 * Os quatro seguintes são sentinelas: têm a MAIOR poupança da fixture, portanto
 * se algum escapar ao gate da montra aparece logo no topo da primeira página.
 */
const CARROS: [string, Record<string, unknown>][] = [
  ["s-catalogo", { vin: VIN }],
  [
    "s-diesel",
    {
      model_id: VM.diesel,
      model_raw: "P9",
      variant: "P9 1.0 TDI",
      year: 2018,
      fuel: "diesel",
      gearbox: "Automatik",
      country: "FR",
      price: 16_000,
      us_version_id: null,
    },
  ],
  [
    "s-hibrido",
    {
      model_id: VM.hibrido,
      model_raw: "P7",
      variant: "P7 hybrid",
      km: 150_000,
      fuel: "híbrido",
      // sem caixa gravada: o `transmissionOf` chama-lhe manual
      gearbox: null,
      country: "ES",
      price: 17_000,
      us_version_id: null,
    },
  ],
  [
    "s-eletrico",
    {
      model_id: VM.eletrico,
      model_raw: "PE",
      variant: "PE electric",
      year: 2021,
      km: 5_000,
      // sem combustível no anúncio: só o vehicle_models sabe que é elétrico
      fuel: null,
      country: "NL",
      price: 18_000,
      us_version_id: null,
    },
  ],
  ["s-morto", { price: 19_000, deleted_at: "2026-07-01 10:00:00" }],
  ["s-alargada", { price: 20_000 }],
  ["s-designacao", { price: 21_000, us_version_id: null, match_confidence: "designacao" }],
  ["s-clone", { price: 22_000, vin: VIN }],
];

/** Estimativas dos anúncios com nome (o resto do default vem do `estimativa`). */
const ESTIMATIVAS: Record<string, Record<string, unknown>> = {
  "s-catalogo": {},
  "s-diesel": { total_pt: 30_000, savings: 4_000, savings_pct: 13, verdict: "marginal" },
  "s-hibrido": { total_pt: 40_000, savings: 3_000, savings_pct: 8 },
  "s-eletrico": { total_pt: 45_000, savings: 2_000, savings_pct: 4, verdict: "marginal" },
  "s-morto": { savings: 9_999 },
  "s-alargada": { savings: 9_999, pt_confidence: "alargada" },
  "s-designacao": { savings: 9_999 },
  // o clone perde o desempate do representante (1 000 < 5 000 do s-catalogo)
  "s-clone": { savings: 1_000 },
};

async function seed(sql: Sql): Promise<void> {
  await sql`
    insert into vehicle_models (id, make, model, fuel, norm_key) values
      (${VM.gasolina}, 'pesqmarke', 'p4', 'gasolina', 'pesqmarke|p4|gasolina'),
      (${VM.diesel}, 'pesqmarke', 'p9', 'diesel', 'pesqmarke|p9|diesel'),
      (${VM.hibrido}, 'pesqmarke', 'p7', 'híbrido', 'pesqmarke|p7|híbrido'),
      (${VM.eletrico}, 'pesqmarke', 'pe', 'elétrico', 'pesqmarke|pe|elétrico'),
      (${VM.enchimento}, 'enchimarke', 'f1', 'gasolina', 'enchimarke|f1|gasolina')
  `;
  // Catálogo: a marca vive no us_models e o nome da versão no us_versions — é a
  // junção dos dois que o cartão mostra, e nenhum campo cru do anúncio a contém.
  await sql`
    insert into us_models (mid, make, model, slug, model_year, url)
    values ('PQ-M1', 'Pesqmarke', 'Pquatro (2022)', 'Pquatro-2022', 2022, 'https://ex.test/m1')
  `;
  await sql`
    insert into us_versions (version_id, mid, name, url, power_hp, displacement_cc)
    values ('PQ-V1', 'PQ-M1', 'Q16 Pquatro Gran Coupe 840d', 'https://ex.test/v1', 320, 2993)
  `;

  for (const [externalId, over] of CARROS) {
    await sql`insert into listings ${sql(carro(externalId, over))}`;
  }
  // Enchimento: 60 anúncios banais e sempre no fundo da ordenação (poupança
  // baixa), com preço distinto para cada um ter identidade de carro própria.
  await sql`insert into listings ${sql(
    Array.from({ length: ENCHIMENTO }, (_, i) =>
      carro(`fill-${String(i).padStart(2, "0")}`, {
        model_id: VM.enchimento,
        make_raw: "Enchimarke",
        model_raw: "F1",
        variant: "F1 1.0",
        year: 2015,
        km: 200_000,
        country: "BE",
        price: 9_000 + i,
        us_version_id: null,
      }),
    ),
  )}`;

  const ids = await sql<{ id: string; external_id: string }[]>`
    select id, external_id from listings
  `;
  for (const { id, external_id } of ids) {
    const over =
      ESTIMATIVAS[external_id] ??
      (() => {
        const i = Number(external_id.slice("fill-".length));
        return {
          total_pt: 90_000 + i,
          savings: 10 + i,
          savings_pct: 1,
          verdict: "nao_compensa",
        };
      })();
    await sql`insert into import_cost_estimates ${sql(estimativa(id, over))}`;
  }
}

async function bootstrap(): Promise<Sql> {
  const admin = postgres(withDbName("postgres"), { prepare: false, max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${TEST_DB} with (force)`).simple();
    await admin.unsafe(`create database ${TEST_DB}`).simple();
  } finally {
    await admin.end();
  }
  const url = withDbName(TEST_DB);
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    stdio: "pipe",
    env: { ...process.env, WAREHOUSE_URL: url, DATABASE_URL: url },
  });
  // O `db` resolve a URL no import — tem de ficar definida ANTES do import
  // dinâmico do lib/queries (ver tests/pipeline/integration.test.ts).
  process.env.WAREHOUSE_URL = url;

  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  await seed(sql);
  return sql;
}

test("pesquisa no servidor: filtros, texto livre e total", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  let sql: Sql;
  try {
    sql = await bootstrap();
  } catch (err) {
    t.skip(`não deu para criar a base de teste (${(err as Error).message.slice(0, 80)})`);
    return;
  }

  const { searchListingsQuery } = await import("../../lib/queries");
  const porId = new Map(
    (await sql<{ id: string; external_id: string }[]>`select id, external_id from listings`).map(
      (r) => [r.id, r.external_id],
    ),
  );

  /** Corre a pesquisa e devolve os external_id na ordem em que vieram. */
  const pesquisar = async (filters: SearchFilters) => {
    const res = await searchListingsQuery(filters, null);
    return { ext: res.listings.map((l) => porId.get(l.id)), total: res.total, res };
  };

  try {
    await t.test("montra completa: uma página, o total é a montra inteira", async () => {
      const { ext, total, res } = await pesquisar({});
      assert.equal(res.listings.length, PAGE_SIZE, "o servidor manda uma página");
      assert.equal(total, ENCHIMENTO + 4, "o total conta os 64 visíveis, não os 24 mandados");
      assert.equal(res.page, 1);
      assert.equal(res.hasMore, true, "64 não cabem numa página de 24");
      assert.equal(ext[0], "s-catalogo", "ordenado por poupança, o do catálogo primeiro");
      // As sentinelas têm a maior poupança da fixture: se o gate cedesse, viam-se.
      for (const fora of ["s-morto", "s-alargada", "s-designacao", "s-clone"]) {
        assert.ok(!ext.includes(fora), `${fora} não pertence à montra`);
      }
    });

    await t.test("o título do cartão vem do catálogo, não dos campos crus", async () => {
      const { res } = await pesquisar({});
      assert.equal(res.listings[0].title, TITULO_DO_CATALOGO);
    });

    await t.test("ano mínimo isola os de 2023", async () => {
      const { ext, total } = await pesquisar({ minYear: 2023 });
      assert.deepEqual(ext, ["s-catalogo", "s-hibrido"]);
      assert.equal(total, 2);
    });

    await t.test("km máximos isolam os pouco rodados", async () => {
      const { ext } = await pesquisar({ maxKm: 60_000 });
      assert.deepEqual(ext, ["s-catalogo", "s-diesel", "s-eletrico"]);
    });

    await t.test("combustível isola o diesel", async () => {
      const { ext } = await pesquisar({ fuel: "diesel" });
      assert.deepEqual(ext, ["s-diesel"]);
    });

    await t.test("combustível segue o fallback do modelo canónico", async () => {
      // O `s-eletrico` não tem combustível no anúncio — o cartão mostra o do
      // vehicle_models, e o filtro tem de o encontrar pelo mesmo caminho.
      const { ext } = await pesquisar({ fuel: "elétrico" });
      assert.deepEqual(ext, ["s-eletrico"]);
    });

    await t.test("caixa automática: pela coluna normalizada, não por regex", async () => {
      const { ext } = await pesquisar({ gearbox: "automática" });
      assert.deepEqual(ext, ["s-diesel"]);
    });

    await t.test("caixa desconhecida não entra em nenhum dos dois filtros", async () => {
      // Mudou com a coluna `gearbox_norm` (migration 0008): antes, `gearbox`
      // nulo virava "manual" no cartão e o filtro copiava esse erro de
      // propósito. Agora a ficha diz "Não indicada" e quem filtra por caixa
      // está a filtrar por certeza — pôr os desconhecidos em "Manual" era
      // repor a mesma mentira noutro sítio.
      const manual = await pesquisar({ gearbox: "manual" });
      const auto = await pesquisar({ gearbox: "automática" });
      assert.ok(!manual.ext.includes("s-hibrido"), "sem caixa gravada não é manual");
      assert.ok(!auto.ext.includes("s-hibrido"), "nem automática");
      assert.ok(!manual.ext.includes("s-diesel"));
      assert.ok(
        manual.total + auto.total < ENCHIMENTO + 4,
        "as duas caixas já não somam a montra toda — e é isso que se quer",
      );
    });

    await t.test("paginação: a página 2 não repete a 1, e o total não muda", async () => {
      const p1 = await pesquisar({});
      const p2 = await pesquisar({ page: 2 });
      assert.equal(p1.total, p2.total, "o total é do conjunto, não da página");
      assert.equal(p2.res.page, 2);
      const ids1 = new Set(p1.res.listings.map((l) => l.id));
      assert.ok(
        p2.res.listings.every((l) => !ids1.has(l.id)),
        "a página 2 não pode repetir carros da 1",
      );
    });

    await t.test("preço máximo é o custo FINAL em Portugal", async () => {
      const { ext } = await pesquisar({ maxPrice: 30_000 });
      assert.deepEqual(ext, ["s-catalogo", "s-diesel"]);
    });

    await t.test("país isola a origem", async () => {
      const { ext } = await pesquisar({ countries: ["FR"] });
      assert.deepEqual(ext, ["s-diesel"]);
    });

    await t.test("só oportunidades isola o veredito 'compensa'", async () => {
      const { ext } = await pesquisar({ onlyOpportunities: true });
      assert.deepEqual(ext, ["s-catalogo", "s-hibrido"]);
    });

    await t.test("os filtros somam-se", async () => {
      const { ext } = await pesquisar({ fuel: "gasolina", minYear: 2023 });
      assert.deepEqual(ext, ["s-catalogo"]);
    });

    await t.test("texto: copiar o título do cartão encontra o carro", async () => {
      const { ext, total } = await pesquisar({ query: TITULO_DO_CATALOGO });
      assert.deepEqual(ext, ["s-catalogo"]);
      assert.equal(total, 1);
    });

    await t.test("texto: uma palavra que só existe no catálogo", async () => {
      // "pquatro" não aparece em nenhum campo cru do anúncio — antes, procurar
      // pelo que a UI mostra não dava nada.
      const { ext } = await pesquisar({ query: "pquatro" });
      assert.deepEqual(ext, ["s-catalogo"]);
    });

    await t.test("texto: uma palavra que só existe no campo cru", async () => {
      const { ext } = await pesquisar({ query: "P9" });
      assert.deepEqual(ext, ["s-diesel"]);
    });

    await t.test("texto: '%' do utilizador é literal, não joker", async () => {
      const { ext, total } = await pesquisar({ query: "%" });
      assert.deepEqual(ext, []);
      assert.equal(total, 0);
    });
  } finally {
    const { closeDb } = await import("../../db");
    await closeDb();
    await sql.end({ timeout: 5 });
  }
});

after(async () => {
  if (skip) return;
  const admin = postgres(withDbName("postgres"), { prepare: false, max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${TEST_DB} with (force)`).simple();
  } finally {
    await admin.end();
  }
});
