/**
 * Guarda de plausibilidade do preço de ORIGEM contra uma Postgres LOCAL
 * descartável (mesmo padrão do pt-market.test.ts / publish.test.ts: base criada
 * do zero, migrada com o drizzle-kit, apagada no fim).
 *
 * Porquê base a sério e não um duplo do `db`: o que aqui pode partir é o SQL —
 * o `distinct on (identity)` sobre a identidade de carro físico (a regra
 * "DISTINCT ON expressions must match initial ORDER BY expressions" mata a query
 * à primeira), o padrão do chassis no URL e a mediana interpolada do Postgres.
 * Um duplo que devolvesse linhas fabricadas testava o `if`, que é a parte
 * trivial, e deixava passar exatamente o que se quer proteger.
 *
 * O módulo só MEDE; quem recusa é o `scripts/pipeline/compute-costs.ts`. O
 * `recusa()` abaixo é a condição desse ficheiro, palavra por palavra — incluindo
 * o "sem amostra passa", que é a metade da regra de que ninguém dá falta até um
 * carro são desaparecer da montra.
 *
 * A fixture é sintética (marca "Origmarke", model_id próprio): a query filtra por
 * `model_id`, portanto cada caso vive isolado do outro.
 *
 * Sem Postgres local (ou sem permissão para criar bases) o teste salta.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { dbUrl, isLocalDbUrl } from "../../lib/db-url";
import { MIN_ORIGIN_RATIO, estimateOriginPrice } from "../../lib/engine/origin-market";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const LOCAL = dbUrl();
const skip = !LOCAL
  ? "sem base de dados — teste do mercado de origem saltado"
  : !isLocalDbUrl(LOCAL)
    ? "base de dados não é local — este teste cria uma base de teste; só local"
    : false;

const TEST_DB = "autoimport_origin_market_test";
const withDbName = (name: string) => {
  const url = new URL(LOCAL);
  url.pathname = `/${name}`;
  return url.toString();
};

/** Modelos canónicos da fixture — um por caso, para não se contaminarem. */
const VM = {
  /** O XC40 reduzido a fixture: alvo a 6 900 € num mercado de mediana 22 850 €. */
  xc40: "44444444-4444-4444-4444-444444444401",
  /** O MESMO mercado, com um alvo a preço de negócio (mas de mercado). */
  normal: "44444444-4444-4444-4444-444444444402",
  /** Preço tão baixo como o do xc40, mas só 4 comparáveis → sem prova. */
  semAmostra: "44444444-4444-4444-4444-444444444403",
  /** Dois mercados do mesmo modelo (DE caro, ES barato) — não se misturam. */
  paises: "44444444-4444-4444-4444-444444444404",
  /** Mercado DE com um par cross-listado (o mesmo carro em dois portais). */
  crossListing: "44444444-4444-4444-4444-444444444405",
};

/** uuid que não existe na base — "não excluas ninguém" sem partir o `<>` uuid. */
const NINGUEM = "00000000-0000-0000-0000-000000000000";

const YEAR = 2022;
const POWER = 262;
const KM = 116_000;

type Sql = ReturnType<typeof postgres>;

/** Um anúncio estrangeiro; devolve o id (o alvo precisa dele para se excluir). */
async function seedCar(
  sql: Sql,
  modelId: string,
  ext: string,
  price: number,
  opts: { country?: string; url?: string; site?: string } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into listings (source_site, external_id, model_id, make_raw, model_raw,
                          year, km, fuel, power_hp, price, country, detail_url)
    values (${opts.site ?? "autocasion.com"}, ${ext}, ${modelId}, 'Origmarke', 'O1',
            ${YEAR}, ${KM}, 'gasolina', ${POWER}, ${price},
            ${opts.country ?? "ES"}, ${opts.url ?? `https://ex.test/${ext}`})
    returning id
  `;
  return row.id;
}

/** ids dos anúncios A AVALIAR (o resto da fixture são só comparáveis). */
const alvo: Record<string, string> = {};

/** Mercado ES de referência: mediana 22 850 € (6 carros). */
const MERCADO_ES = [17_900, 20_500, 22_700, 23_000, 24_900, 26_500];

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

  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  for (const [key, id] of Object.entries(VM)) {
    await sql`
      insert into vehicle_models (id, make, model, fuel, norm_key)
      values (${id}, 'origmarke', 'o1', 'gasolina', ${`origmarke|o1|gasolina|${key}`})
    `;
  }

  // O caso real reduzido: XC40 T5 Recharge 2022, 116 000 km, autocasion, 6 900 €
  // contra um mercado ES de mediana 22 850 € — rácio 0,302.
  for (const [i, p] of MERCADO_ES.entries()) await seedCar(sql, VM.xc40, `xc-${i}`, p);
  alvo.xc40 = await seedCar(sql, VM.xc40, "xc-alvo", 6_900);

  // O MESMO mercado com um alvo a 19 000 € — abaixo da mediana, como qualquer
  // oportunidade (rácio 0,83), e longe do piso. É a prova de que a guarda não é
  // um teto de poupança disfarçado.
  for (const [i, p] of MERCADO_ES.entries()) await seedCar(sql, VM.normal, `no-${i}`, p);
  alvo.normal = await seedCar(sql, VM.normal, "no-alvo", 19_000);

  // Preço tão indefensável como o do xc40, mas com 4 comparáveis (n<5): sem prova
  // não se recusa. Se um dia se largar o MIN_SAMPLE, é este caso que cai.
  for (const [i, p] of MERCADO_ES.slice(0, 4).entries())
    await seedCar(sql, VM.semAmostra, `sa-${i}`, p);
  alvo.semAmostra = await seedCar(sql, VM.semAmostra, "sa-alvo", 6_900);

  // Mercados separados: 6 comparáveis DE caros (mediana 35 500 €) + 6 ES baratos
  // (mediana 9 350 €), e o alvo é ES a 8 000 €. Contra o ES é preço de mercado
  // (0,86); se os países se misturassem a mediana subia e o carro era recusado.
  for (const [i, p] of [33_000, 34_000, 35_000, 36_000, 37_000, 38_000].entries())
    await seedCar(sql, VM.paises, `pa-de-${i}`, p, { country: "DE", site: "autoscout24.de" });
  for (const [i, p] of [8_500, 8_900, 9_200, 9_500, 9_900, 10_500].entries())
    await seedCar(sql, VM.paises, `pa-es-${i}`, p);
  alvo.paises = await seedCar(sql, VM.paises, "pa-alvo", 8_000);

  // Cross-listing ESTRANGEIRO (o Porsche autoboerse.de ↔ meinauto.de da fase 1):
  // 4 carros distintos + 1 par que é o MESMO carro, com o chassis no slug dos dois
  // URLs e preços diferentes nos dois portais.
  const chassis = "wp0zzz99zts392124";
  for (const [i, p] of [29_000, 30_000, 33_000, 34_000].entries())
    await seedCar(sql, VM.crossListing, `cl-${i}`, p, { country: "DE", site: "autoboerse.de" });
  await seedCar(sql, VM.crossListing, "cl-clone-a", 31_000, {
    country: "DE",
    site: "autoboerse.de",
    url: `https://www.autoboerse.de/porsche-911-carrera-${chassis}/`,
  });
  await seedCar(sql, VM.crossListing, "cl-clone-b", 32_000, {
    country: "DE",
    site: "meinauto.de",
    url: `https://www.meinauto.de/gw/porsche-911-${chassis}-2022`,
  });
  alvo.crossListing = await seedCar(sql, VM.crossListing, "cl-alvo", 9_900, {
    country: "DE",
    site: "autoscout24.de",
  });

  return sql;
}

test("guarda de plausibilidade do preço de origem", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  const sql = await bootstrap();
  const db = drizzle(sql, { schema });

  /** A condição do scripts/pipeline/compute-costs.ts, palavra por palavra. */
  const recusa = (price: number, origin: { median: number; n: number } | null) =>
    origin != null && price / origin.median < MIN_ORIGIN_RATIO;

  const medir = (modelId: string, country: string, excluir: string, km = KM, power = POWER) =>
    estimateOriginPrice(db, modelId, country, YEAR, km, power, excluir);

  try {
    await t.test("preço a 0,30 do próprio mercado → recusado", async () => {
      const origin = await medir(VM.xc40, "ES", alvo.xc40 as string);
      assert.deepEqual(origin, { median: 22_850, n: 6 });
      assert.equal(recusa(6_900, origin), true);
    });

    await t.test("o próprio anúncio não entra na sua amostra", async () => {
      // Sem a exclusão são 7 carros e a mediana cai de 22 850 para 22 700 — o
      // carro a puxar a amostra na direção que o inocenta.
      assert.deepEqual(await medir(VM.xc40, "ES", NINGUEM), { median: 22_700, n: 7 });
    });

    await t.test("preço abaixo da mediana mas de mercado → aceite", async () => {
      const origin = await medir(VM.normal, "ES", alvo.normal as string);
      assert.deepEqual(origin, { median: 22_850, n: 6 });
      assert.equal(recusa(19_000, origin), false);
    });

    await t.test("amostra insuficiente (n<5) → passa (sem prova não se recusa)", async () => {
      const origin = await medir(VM.semAmostra, "ES", alvo.semAmostra as string);
      assert.equal(origin, null);
      // O MESMO preço indefensável do xc40 — e passa: a regra corta nos dois lados.
      assert.equal(recusa(6_900, origin), false);
    });

    await t.test("mercado sem nenhum comparável → passa", async () => {
      assert.equal(await medir("44444444-4444-4444-4444-4444444444ff", "ES", NINGUEM), null);
    });

    await t.test("a amostra é do MESMO país (o DE caro não recusa o ES barato)", async () => {
      const es = await medir(VM.paises, "ES", alvo.paises as string);
      assert.deepEqual(es, { median: 9_350, n: 6 });
      assert.equal(recusa(8_000, es), false);
      // O outro lado da prova: no mercado DE do mesmo modelo a mediana é 3,8×,
      // e o mesmo carro seria recusado. Misturar os dois era isto.
      const de = await medir(VM.paises, "DE", NINGUEM);
      assert.deepEqual(de, { median: 35_500, n: 6 });
      assert.equal(recusa(8_000, de), true);
    });

    await t.test("cross-listing estrangeiro conta 1× (5 carros, não 6)", async () => {
      // Sem dedupe: 6 linhas (29/30/31/32/33/34 k) → mediana 31 500.
      // Com dedupe, o par 31 000/32 000 é UM carro e fica pelo preço mais baixo
      // (o desempate do módulo) → 5 carros, mediana 31 000. A asserção prende as
      // duas coisas ao mesmo tempo: o n e o desempate.
      const origin = await medir(VM.crossListing, "DE", alvo.crossListing as string);
      assert.deepEqual(origin, { median: 31_000, n: 5 });
      assert.equal(recusa(9_900, origin), true);
    });

    await t.test("comparável com km fora da janela 0,6×–1,6× não conta", async () => {
      // A amostra do xc40 é toda a 116 000 km; para um carro de 30 000 km a janela
      // é 18 000–48 000 e não entra nenhum.
      assert.equal(await medir(VM.xc40, "ES", NINGUEM, 30_000), null);
    });

    await t.test("comparável de outra potência não conta", async () => {
      // ±max(10%,15cv) a 262 cv são ±26 cv: um 150 cv não é o mesmo modelo.
      assert.equal(await medir(VM.xc40, "ES", NINGUEM, KM, 150), null);
    });
  } finally {
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
