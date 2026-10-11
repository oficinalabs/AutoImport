/**
 * P04: as dez fontes DE/NL/BE trazem `vat_regime`, `price_net`, `image_urls` e (NL) `plate`
 * no registo do coletor, a partir das fixtures em tests/collector/fixtures/p04/ (reconstruídas —
 * ver o README dessa pasta). Cada fonte tem pelo menos um anúncio por regime que consegue ler.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseListingPage as parseAutoboerse } from "../../tools/collector/autoboerse/parse";
import { normalizeAd } from "../../tools/collector/autohero/schema";
import { normalizeCard as normalizeAutoline } from "../../tools/collector/autoline/schema";
import { parseDetail } from "../../tools/collector/autoscout24/detail";
import { parseListingPage as parseAs24 } from "../../tools/collector/autoscout24/parse";
import { parseListingPage as parseAutotrader } from "../../tools/collector/autotrader/parse";
import { MARKETS } from "../../tools/collector/autouncle/http";
import { normalizeCar } from "../../tools/collector/autouncle/schema";
import { normalizeVehicle as normalizeMeinauto } from "../../tools/collector/meinauto/schema";
import { normalizeCard as normalizeOoyyo } from "../../tools/collector/ooyyo/schema";
import { normalizeListing as normalizeQuoka } from "../../tools/collector/quoka/schema";
import { normalizeVehicle as normalizeTheparking } from "../../tools/collector/theparking/schema";

const FIX = "tests/collector/fixtures/p04";
const html = (f: string) => readFileSync(`${FIX}/${f}`, "utf8");
// Payloads externos de forma dinâmica: cada normalizador tipa só o que lê.
const outras = JSON.parse(readFileSync(`${FIX}/outras-fontes.json`, "utf8")) as Record<
  string,
  Record<string, never>[]
>;
const vat = (r: { vat_regime?: unknown; price_net?: unknown }) => [r.vat_regime, r.price_net];

test("AutoScout24 (listagem DE): dedutível com líquido, margem, particular, sem menção, preço zzgl.", () => {
  const { listings } = parseAs24(html("autoscout24-lst-de.html"));
  const by = Object.fromEntries(listings.map((l) => [l.id, l]));
  assert.deepEqual(vat(by["as24-ded-1"]), ["dedutivel", 25000]);
  assert.deepEqual(vat(by["as24-marge-1"]), ["margem", null]);
  assert.deepEqual(vat(by["as24-privat-1"]), ["particular", null]);
  assert.deepEqual(
    vat(by["as24-semmencao-1"]),
    [null, null],
    "isVatLabelLegallyRequired sozinho não é 'MwSt. ausweisbar'",
  );
  assert.deepEqual(
    vat(by["as24-netto-1"]),
    ["dedutivel", 19000],
    "zzgl. MwSt.: o preço já é o líquido",
  );
  assert.equal(by["as24-ded-1"].image_urls?.length, 8, "galeria cortada em 8");
  assert.equal(by["as24-ded-1"].plate, null, "matrícula só nos NL");
});

test("AutoScout24 (detalhe NL): IVA e preço líquido do bloco de preços, matrícula, galeria", () => {
  const d = parseDetail(html("autoscout24-detail-nl.html"), 24200);
  assert.ok(d);
  assert.deepEqual(vat(d), ["dedutivel", 20000]);
  assert.equal(d.license_plate, "GB-123-X");
  assert.equal(d.image_urls?.length, 3);
});

test("AutoTrader.nl: BTW verrekenbaar, excl. BTW, marge, particulier, sem menção; matrícula", () => {
  const { listings } = parseAutotrader(html("autotrader-nl.html"));
  const by = Object.fromEntries(listings.map((l) => [l.id, l]));
  assert.deepEqual(vat(by["at-btw-1"]), ["dedutivel", null]);
  assert.deepEqual(vat(by["at-excl-1"]), ["dedutivel", 20000]);
  assert.deepEqual(vat(by["at-marge-1"]), ["margem", null]);
  assert.deepEqual(vat(by["at-particulier-1"]), ["particular", null]);
  assert.deepEqual(vat(by["at-semmencao-1"]), [null, null]);
  assert.equal(by["at-btw-1"].plate, "GB-123-X");
  assert.equal(by["at-semmencao-1"].plate, null);
  assert.equal(by["at-btw-1"].image_urls?.length, 4);
});

test("autoboerse: flag de IVA com líquido, Differenzbesteuerung, sem menção; galeria com a default 1.º", () => {
  const { listings } = parseAutoboerse(html("autoboerse-de.html"));
  const by = Object.fromEntries(listings.map((l) => [l.id, l]));
  assert.deepEqual(vat(by["ab-1"]), ["dedutivel", 24000]);
  assert.deepEqual(vat(by["ab-2"]), ["margem", null]);
  assert.deepEqual(vat(by["ab-3"]), [null, null]);
  assert.deepEqual(by["ab-1"].image_urls, [
    "https://img.autoboerse.de/AB1/0.jpg",
    "https://img.autoboerse.de/AB1/1.jpg",
    "https://img.autoboerse.de/AB1/2.jpg",
  ]);
});

test("meinauto: líquido da calculation; sem menção; galeria pelo CDN", () => {
  const [a, b] = outras.meinauto.map((r) => normalizeMeinauto(r));
  assert.deepEqual(vat(a), ["dedutivel", 22000]);
  assert.deepEqual(a.image_urls, [
    "https://assets-meinauto.de/marketplace/stock/mara/a/1",
    "https://assets-meinauto.de/marketplace/stock/mara/a/2",
  ]);
  assert.deepEqual(vat(b), [null, null]);
  assert.equal(b.image_urls, null);
});

test("Autohero: enum de IVA dedutível / margem / ausente", () => {
  const [a, b, c] = outras.autohero.map((r) => normalizeAd(r));
  assert.deepEqual(vat(a), ["dedutivel", null]);
  assert.deepEqual(vat(b), ["margem", null]);
  assert.deepEqual(vat(c), [null, null]);
});

test("quoka: P2P é particular, a não ser que o texto mostre um stand", () => {
  const [a, b] = outras.quoka.map((r) => normalizeQuoka(r.card, { ld: r.ld }));
  assert.deepEqual(vat(a), ["particular", null]);
  assert.equal(a.image_urls?.length, 2);
  assert.deepEqual(vat(b), ["dedutivel", 21000]);
});

test("autoline (BE): 'sem IVA' no preço → dedutível com líquido = preço; sem menção → null", () => {
  const [a, b] = outras.autoline.map((r) =>
    normalizeAutoline(r.card, r.product, { countryCode: "BE" }),
  );
  assert.deepEqual(vat(a), ["dedutivel", 9900]);
  assert.equal(a.image_urls?.length, 2);
  assert.deepEqual(vat(b), [null, null]);
});

test("theparking: vocabulário NL/BE na descrição; galeria do JSON-LD", () => {
  const [a, b] = outras.theparking.map((r) => normalizeTheparking(r));
  assert.deepEqual(vat(a), ["dedutivel", 14000]);
  assert.equal(a.image_urls?.length, 2);
  assert.deepEqual(vat(b), ["margem", null]);
});

test("ooyyo (BE): TVA déductible no título; sem menção → null", () => {
  const [a, b] = outras.ooyyo.map((r) => normalizeOoyyo(r as never));
  assert.deepEqual(vat(a), ["dedutivel", null]);
  assert.deepEqual(vat(b), [null, null]);
});

test("autouncle: MwSt. ausweisbar no título; vendedor privado → particular", () => {
  const [a, b] = outras.autouncle.map((r) => normalizeCar(r.item, r.extra, { market: MARKETS.de }));
  assert.deepEqual(vat(a), ["dedutivel", null]);
  assert.deepEqual(vat(b), ["particular", null]);
});
