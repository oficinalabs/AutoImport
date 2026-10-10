/**
 * Campos opcionais do P01 no sink dos coletores (tools/collector/lib/db-sink.ts):
 * `vat_regime`, `price_net`, `image_urls`, `plate` e `km_check`.
 *
 * O que pode partir em silêncio: um coletor que ainda não lê o IVA (ou um re-crawl
 * que não trouxe a galeria) apagar o valor que outro crawl já tinha gravado. Por
 * isso o sink grava-os com `coalesce`, e é isso que o teste de base prova. Os
 * normalizadores puros correm sempre; o teste de base salta sem Postgres local.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import postgres from "postgres";
import { dbUrl } from "../../lib/db-url";
import {
  DbSink,
  imageUrls,
  kmCheck,
  plate,
  priceNet,
  vatRegime,
} from "../../tools/collector/lib/db-sink";
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

const LOCAL = dbUrl();
const skip = skipUnlessLocalDb("o teste do sink (P01)");
const TEST_DB = "autoimport_p01_sink_test";

test("vat_regime: só os três valores do contrato; o resto é 'não diz'", () => {
  assert.equal(vatRegime("dedutivel"), "dedutivel");
  assert.equal(vatRegime(" Margem "), "margem");
  assert.equal(vatRegime("particular"), "particular");
  assert.equal(vatRegime("MwSt. ausweisbar"), null, "o coletor traduz; o sink não adivinha");
  assert.equal(vatRegime(null), null);
});

test("price_net: positivo e nunca acima do preço com IVA", () => {
  assert.equal(priceNet(16807, 20000), 16807);
  assert.equal(priceNet("16.807 €", 20000), 16807);
  assert.equal(priceNet(0, 20000), null);
  assert.equal(priceNet(21000, 20000), null, "líquido > bruto é lixo da fonte");
  assert.equal(priceNet(16807, null), 16807);
});

test("image_urls: até 8, sem repetidos, só http(s); `images` numérico ignora-se", () => {
  const many = Array.from({ length: 10 }, (_, i) => `https://img.test/${i}.jpg`);
  assert.deepEqual(imageUrls({ image_urls: many }), many.slice(0, 8));
  assert.deepEqual(
    imageUrls({ image_urls: ["https://a.test/1.jpg", "https://a.test/1.jpg", "/rel.jpg", null] }),
    ["https://a.test/1.jpg"],
  );
  assert.deepEqual(imageUrls({ images: ["https://a.test/x.jpg"] }), ["https://a.test/x.jpg"]);
  assert.equal(imageUrls({ images: 12 }), null, "vários coletores usam `images` como contagem");
  assert.equal(imageUrls({ image_urls: [] }), null, "lista vazia não apaga a galeria anterior");
});

test("plate: normalizada como a RDW a pede", () => {
  assert.equal(plate("12-abc-3"), "12ABC3");
  assert.equal(plate(" GB 123 X "), "GB123X");
  assert.equal(plate(""), null);
});

test("km_check: só fonte e veredito conhecidos, com data válida", () => {
  const ok = { source: "RDW", verdict: "coerente", checkedAt: "2026-10-01T00:00:00Z" };
  assert.deepEqual(kmCheck(ok), ok);
  assert.equal(kmCheck({ ...ok, source: "carVertical" }), null);
  assert.equal(kmCheck({ ...ok, verdict: "ok" }), null);
  assert.equal(kmCheck({ ...ok, checkedAt: "ontem" }), null);
  assert.equal(kmCheck("RDW"), null);
});

test("re-crawl sem os campos novos não apaga o que já estava gravado", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  const url = withDbName(LOCAL, TEST_DB);
  try {
    await recreateDatabases(LOCAL, TEST_DB);
    migrate(url);
  } catch (err) {
    t.skip(`não deu para criar a base de teste (${(err as Error).message.slice(0, 80)})`);
    return;
  }

  const base = {
    id: "p01-sink-nl-1",
    source_site: "autotrader.nl",
    make: "Testmarke",
    model: "T100",
    year: 2022,
    km: 30000,
    country: "NETHERLANDS",
    price: 24200,
    detail_url: "https://example.test/p01-sink-nl-1",
    image: "https://img.test/0.jpg",
  };
  const km = { source: "RDW", verdict: "coerente", checkedAt: "2026-10-01T00:00:00.000Z" };
  const sink = new DbSink(url);
  const sql = postgres(url, { prepare: false });
  const row = async () => {
    const [r] = await sql`
      select vat_regime, price_net, image_urls, plate, km_check
      from listings where external_id = 'p01-sink-nl-1'
    `;
    return { ...r };
  };
  try {
    await sink.upsertListing(
      {
        ...base,
        vat_regime: "dedutivel",
        price_net: 20000,
        image_urls: ["https://img.test/0.jpg", "https://img.test/1.jpg"],
        plate: "gb-123-x",
        km_check: km,
      },
      "new",
      "autotrader",
    );
    const expected = {
      vat_regime: "dedutivel",
      price_net: 20000,
      image_urls: ["https://img.test/0.jpg", "https://img.test/1.jpg"],
      plate: "GB123X",
      km_check: km,
    };
    assert.deepEqual(await row(), expected, "1.º crawl grava os campos novos");

    // Re-crawl por um caminho que não os conhece (ou uma página que não os mostrou).
    await sink.upsertListing(base, "new", "autotrader");
    assert.deepEqual(await row(), expected, "o coalesce preserva-os");

    // Um crawl que os traz atualizados substitui.
    await sink.upsertListing({ ...base, vat_regime: "margem" }, "new", "autotrader");
    assert.equal((await row()).vat_regime, "margem");
  } finally {
    await sink.close();
    await sql.end({ timeout: 5 });
  }
});

after(async () => {
  if (!skip) await dropDatabases(LOCAL, TEST_DB);
});
