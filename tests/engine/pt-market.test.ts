/**
 * Guardas de coerência do `estimatePtPrice` contra uma Postgres LOCAL
 * descartável (mesmo padrão do publish.test.ts: base criada do zero, migrada com
 * o drizzle-kit, apagada no fim).
 *
 * Porquê base a sério e não um duplo do `db`: o que aqui pode partir é o SQL —
 * o `percentile_cont` dentro do `distinct on (identity)` (a regra "DISTINCT ON
 * expressions must match initial ORDER BY expressions" mata a query à primeira)
 * e os quartis interpolados do Postgres, que NÃO são os de uma implementação
 * caseira em JS. Um duplo que devolvesse linhas fabricadas testava o `if`, que é
 * a parte trivial, e deixava passar exatamente o que se quer proteger.
 *
 * A fixture é sintética (marca "Ptmarke", model_id próprio): a query filtra por
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
import { estimatePtPrice } from "../../lib/engine/pt-market";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const LOCAL = dbUrl();
const skip = !LOCAL
  ? "sem base de dados — teste do mercado PT saltado"
  : !isLocalDbUrl(LOCAL)
    ? "base de dados não é local — este teste cria uma base de teste; só local"
    : false;

const TEST_DB = "autoimport_pt_market_test";
const withDbName = (name: string) => {
  const url = new URL(LOCAL);
  url.pathname = `/${name}`;
  return url.toString();
};

/** Modelos canónicos da fixture — um por caso, para não se contaminarem. */
const VM = {
  coerente: "33333333-3333-3333-3333-333333333301",
  disperso: "33333333-3333-3333-3333-333333333302",
  alargadaOk: "33333333-3333-3333-3333-333333333303",
  alargadaBimodal: "33333333-3333-3333-3333-333333333304",
  frota: "33333333-3333-3333-3333-333333333305",
  kmPoucoRodada: "33333333-3333-3333-3333-333333333306",
  kmMuitoRodada: "33333333-3333-3333-3333-333333333307",
  huracan: "33333333-3333-3333-3333-333333333308",
};

const YEAR = 2022;
const POWER = 150;
/** km → banda 2 (a base) e banda 4 (só alcançável pelo fallback ±2). */
const KM_BANDA_2 = 60_000;
const KM_BANDA_4 = 110_000;

type Sql = ReturnType<typeof postgres>;

/** Um anúncio PT + a sua observação do dia. Preço distinto ⇒ identidade distinta. */
async function seedCar(
  sql: Sql,
  modelId: string,
  ext: string,
  price: number,
  km: number,
  seller: string,
): Promise<void> {
  const [row] = await sql<{ id: string }[]>`
    insert into listings (source_site, external_id, model_id, make_raw, model_raw,
                          year, km, fuel, power_hp, price, country, detail_url, seller_name)
    values ('standvirtual.com', ${ext}, ${modelId}, 'Ptmarke', 'P1',
            ${YEAR}, ${km}, 'gasolina', ${POWER}, ${price}, 'PT',
            ${`https://ex.test/${ext}`}, ${seller})
    returning id
  `;
  await sql`
    insert into pt_price_observations (model_id, listing_id, year, km_band, price, source_site)
    values (${modelId}, ${row.id}, ${YEAR}, ${Math.floor(km / 25_000)}, ${price}, 'standvirtual.com')
  `;
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

  const sql = postgres(url, { prepare: false, onnotice: () => {} });
  for (const [key, id] of Object.entries(VM)) {
    await sql`
      insert into vehicle_models (id, make, model, fuel, norm_key)
      values (${id}, 'ptmarke', 'p1', 'gasolina', ${`ptmarke|p1|gasolina|${key}`})
    `;
  }

  // Coerente: n=6, IQR 0,047 · 6 vendedores → estimativa `normal`, mediana 20.250.
  const coerente = [19_500, 19_900, 20_000, 20_500, 21_000, 21_500];
  for (const [i, p] of coerente.entries())
    await seedCar(sql, VM.coerente, `co-${i}`, p, KM_BANDA_2, `stand-${i}`);

  // O bug: n=5, 5 preços, 5 vendedores — passa n≥5/≥3 preços/≥2 vendedores e
  // devolvia "mercado 215.000 €". p25 190k · p75 280k ⇒ IQR 0,42. O fallback
  // também não a salva: (max−min)/mediana = 0,72 > MAX_WIDE_SPREAD.
  const disperso = [175_000, 190_000, 215_000, 280_000, 330_000];
  for (const [i, p] of disperso.entries())
    await seedCar(sql, VM.disperso, `di-${i}`, p, KM_BANDA_2, `stand-${i}`);

  // Fallback saudável: 2 na banda base (primária n=2 < 5) + 4 a ±2 → n=6 coerente.
  const alargadaOk = [24_000, 24_500, 25_000, 25_500, 26_000, 26_500];
  for (const [i, p] of alargadaOk.entries())
    await seedCar(sql, VM.alargadaOk, `ao-${i}`, p, i < 2 ? KM_BANDA_2 : KM_BANDA_4, `stand-${i}`);

  // Fallback bimodal: n=8 em dois blocos. (max−min)/mediana = 0,26 ≤ 0,30 (passa
  // a guarda ANTIGA do fallback) mas p25 100.175 · p75 129.825 ⇒ IQR 0,258 > 0,25.
  // É o caso que prova que a guarda nova SOMA à antiga em vez de a duplicar.
  const bimodal = [100_000, 100_100, 100_200, 100_300, 129_700, 129_800, 129_900, 130_000];
  for (const [i, p] of bimodal.entries())
    await seedCar(
      sql,
      VM.alargadaBimodal,
      `bi-${i}`,
      p,
      i < 2 ? KM_BANDA_2 : KM_BANDA_4,
      `stand-${i}`,
    );

  // Frota: n=6 mas 2 preços e 1 vendedor — as guardas antigas continuam a matar.
  for (const [i, p] of [23_490, 23_490, 23_490, 23_490, 23_990, 23_990].entries())
    await seedCar(sql, VM.frota, `fr-${i}`, p, KM_BANDA_2, "santogal");

  // Amostra POUCO rodada (26–30 mil km, banda 1) e coerente. É a mesma amostra
  // para os dois lados da guarda de km: um carro de 74 000 km (banda 2, logo a
  // amostra continua no alcance ±1) tem 2,6× os km da mediana → sem estimativa;
  // um de 30 000 km compara-se de igual para igual → estimativa. O segundo caso
  // é a prova de que a amostra é sã e que só os km a matam no primeiro.
  for (const [i, p] of [19_500, 19_900, 20_000, 20_500, 21_000, 21_500].entries())
    await seedCar(sql, VM.kmPoucoRodada, `pr-${i}`, p, 26_000 + i * 800, `stand-${i}`);

  // Amostra MUITO rodada (70–74,5 mil km, banda 2, mediana 72 250 km): o carro de
  // 26 000 km tem 2,8× MENOS km e continua a receber a mediana — a guarda é
  // UNILATERAL de propósito (menos km vale mais, a poupança sai subestimada, que
  // é o lado seguro do erro).
  for (const [i, p] of [30_000, 30_500, 31_000, 31_500, 32_000, 32_500].entries())
    await seedCar(sql, VM.kmMuitoRodada, `mr-${i}`, p, 70_000 + i * 900, `stand-${i}`);

  // O caso real reduzido a fixture — Lamborghini Huracán ES, 44 500 km, contra
  // uma amostra PT de mediana 419 000 € e mediana de km 7 500 (5,3× menos
  // rodados). A amostra é COERENTE (p25 407 500 · p75 428 250 ⇒ IQR 0,05), por
  // isso o MAX_IQR_SPREAD deixa-a passar: é a prova de que esta guarda apanha o
  // que a da dispersão não apanha. Mesma fixture, dois km — só o excesso mata.
  const huracan = [395_000, 405_000, 415_000, 423_000, 430_000, 445_000];
  for (const [i, p] of huracan.entries())
    await seedCar(sql, VM.huracan, `hu-${i}`, p, 6_000 + i * 600, `stand-${i}`);

  return sql;
}

test("guardas de coerência da amostra PT", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  const sql = await bootstrap();
  const db = drizzle(sql, { schema });
  /** km do carro estrangeiro (a banda sai deles dentro do estimatePtPrice). */
  const estimar = (modelId: string, km = KM_BANDA_2) =>
    estimatePtPrice(db, modelId, YEAR, km, POWER);
  try {
    await t.test("amostra coerente → mediana com confiança normal", async () => {
      assert.deepEqual(await estimar(VM.coerente), {
        estimatedPrice: 20_250,
        sampleSize: 6,
        confidence: "normal",
      });
    });

    await t.test("amostra dispersa (IQR 0,42) não é mercado → sem estimativa", async () => {
      assert.equal(await estimar(VM.disperso), null);
    });

    await t.test("fallback coerente continua a dar confiança alargada", async () => {
      assert.deepEqual(await estimar(VM.alargadaOk), {
        estimatedPrice: 25_250,
        sampleSize: 6,
        confidence: "alargada",
      });
    });

    await t.test("fallback bimodal passa o teto max−min mas falha o IQR", async () => {
      assert.equal(await estimar(VM.alargadaBimodal), null);
    });

    await t.test("guarda anti-frota intacta (2 preços, 1 vendedor)", async () => {
      assert.equal(await estimar(VM.frota), null);
    });

    await t.test("modelo sem observações → sem estimativa", async () => {
      assert.equal(
        await estimatePtPrice(db, "33333333-3333-3333-3333-3333333333ff", YEAR, KM_BANDA_2, POWER),
        null,
      );
    });

    await t.test("carro com km muito acima da mediana da amostra → sem estimativa", async () => {
      // 74 000 km contra mediana 28 000 ⇒ (75 000/29 000) = 2,59 > 1,6.
      assert.equal(await estimar(VM.kmPoucoRodada, 74_000), null);
    });

    await t.test("a MESMA amostra serve um carro de km comparável", async () => {
      // A prova de que só os km matam o caso acima: a amostra passa tudo o resto.
      assert.deepEqual(await estimar(VM.kmPoucoRodada, 30_000), {
        estimatedPrice: 20_250,
        sampleSize: 6,
        confidence: "normal",
      });
    });

    await t.test("carro com km muito ABAIXO da amostra continua a ter mediana", async () => {
      // 26 000 km contra mediana 72 250 ⇒ 0,37 — a guarda é unilateral, só corta
      // o excesso (menos km vale mais: a poupança sai subestimada, lado seguro).
      assert.deepEqual(await estimar(VM.kmMuitoRodada, 26_000), {
        estimatedPrice: 31_250,
        sampleSize: 6,
        confidence: "normal",
      });
    });

    await t.test("Huracán: amostra coerente (IQR 0,05) mas 5,3× os km → sem estimativa", async () => {
      // O nº 1 da montra em produção: 44 500 km comparado com uma amostra de
      // mediana 7 500 km fabricava 123 227 € de "poupança". A guarda do IQR não o
      // apanha — esta apanha.
      assert.equal(await estimar(VM.huracan, 44_500), null);
    });

    await t.test("Huracán com km da amostra → a mesma amostra é mercado", async () => {
      assert.deepEqual(await estimar(VM.huracan, 8_000), {
        estimatedPrice: 419_000,
        sampleSize: 6,
        confidence: "normal",
      });
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
