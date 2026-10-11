/**
 * P05 — coletores FR/ES: regime de IVA, preço líquido e fotos (até 8) por anúncio.
 *
 * Fixtures sintéticas com a estrutura que cada parser lê (ver fixtures/p05/README.md).
 * O que pode partir em silêncio: marcar um carro como 'dedutivel' sem o anúncio o dizer (o
 * motor dividia o preço por 1,21 e inventava margem). Por isso os casos "sem menção → null"
 * e "margem ganha a dedutível" são tão importantes como os positivos.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseListingPage as parseAramis } from "../../tools/collector/aramisauto/parse";
import { parseListingPage as parseAutocasion } from "../../tools/collector/autocasion/parse";
import { parseListingPage as parseFlexicar } from "../../tools/collector/flexicar/parse";
import { imageUrls, priceNet, vatRegime } from "../../tools/collector/lib/db-sink";
import { galleryUrls, vatFromTextEs } from "../../tools/collector/lib/vat-text-es";
import { QUERY_IVA_DEDUCIBLE } from "../../tools/collector/ocasionplus/crawl";
import { parseListingPage as parseOcasionplus } from "../../tools/collector/ocasionplus/parse";
import { parseListingPage as parseTrovit } from "../../tools/collector/trovit/parse";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", "p05", name), "utf8");

test("vatFromTextEs: vocabulário do estudo ES §3.2", () => {
  assert.deepEqual(vatFromTextEs("Coche de empresa, IVA deducible"), {
    regime: "dedutivel",
    priceNet: null,
  });
  assert.equal(vatFromTextEs("I.V.A. deducible").regime, "dedutivel");
  assert.equal(vatFromTextEs("Factura con IVA desglosado").regime, "dedutivel");
  assert.equal(vatFromTextEs("Precio final. REBU").regime, "margem");
  assert.equal(vatFromTextEs("Régimen especial de los bienes usados").regime, "margem");
  // Sem menção, ou só "IVA incluido" (que o coches.net mostra em todos): o anúncio não diz.
  assert.deepEqual(vatFromTextEs("Garantía 12 meses, IVA incluido"), {
    regime: null,
    priceNet: null,
  });
  assert.deepEqual(vatFromTextEs(null), { regime: null, priceNet: null });
});

test("vatFromTextEs: margem ganha a dedutível e 'no deducible' não é dedutível", () => {
  assert.equal(vatFromTextEs("IVA no deducible").regime, "margem");
  assert.equal(vatFromTextEs("IVA incluido (REBU), factura con IVA").regime, "margem");
});

test("vatFromTextEs: preço líquido só quando o texto o escreve com valor", () => {
  assert.equal(vatFromTextEs("16.000 € + IVA, IVA deducible").priceNet, 16000);
  assert.equal(vatFromTextEs("IVA deducible. Precio sin IVA: 13.140 €").priceNet, 13140);
  assert.equal(vatFromTextEs("IVA deducible. 15900€ +IVA").priceNet, 15900);
  // Valores pequenos (ex.: um extra de 300 €) não contam como preço do carro.
  assert.equal(vatFromTextEs("IVA deducible. Transporte 300 € + IVA").priceNet, null);
});

test("galleryUrls: até 8, sem repetidos, só http(s), protocolo-relativas → https", () => {
  const urls = Array.from({ length: 12 }, (_, i) => `https://img/x${i % 10}.jpg`);
  assert.equal(galleryUrls(urls)?.length, 8);
  assert.deepEqual(galleryUrls(["//img/a.jpg", { url: "https://img/b.jpg" }, "data:x", 3]), [
    "https://img/a.jpg",
    "https://img/b.jpg",
  ]);
  assert.equal(galleryUrls([]), null);
  assert.equal(galleryUrls(null), null);
});

test("OcasionPlus: a página 'IVA deducible' marca os carros; a listagem geral não", () => {
  const html = fixture("ocasionplus-iva-deducible.html");
  const marcada = parseOcasionplus(html, { vatRegime: QUERY_IVA_DEDUCIBLE.vatRegime });
  assert.equal(marcada.listings.length, 2);
  assert.ok(marcada.listings.every((r) => r.vat_regime === "dedutivel"));
  assert.equal(QUERY_IVA_DEDUCIBLE.path, "/coches-ocasion/iva-deducible");

  const geral = parseOcasionplus(html);
  assert.ok(geral.listings.every((r) => r.vat_regime === null));

  const [a3, ibiza] = marcada.listings;
  assert.equal(a3.price, 21319);
  assert.equal(a3.image_urls?.length, 8); // 10 na fonte, 1 repetida → 9 únicas → 8
  assert.equal(a3.image_urls?.[0], a3.image);
  assert.deepEqual(ibiza.image_urls, ["https://img.ocasionplus.com/ibiza-1.jpg"]);
});

test("Flexicar: taxDeductible true → dedutivel, false → margem, ausente → null", () => {
  const { listings } = parseFlexicar(fixture("flexicar-listagem.html"));
  const byId = new Map(listings.map((r) => [r.id, r]));
  const audi = byId.get(903000000237291);
  const seat = byId.get(903000000253626);
  const kia = byId.get(903000000257765);
  assert.equal(audi?.vat_regime, "dedutivel");
  assert.equal(seat?.vat_regime, "margem");
  assert.equal(kia?.vat_regime, null);
  // Galeria: path relativo ganha o domínio; objeto {url} também conta.
  assert.deepEqual(audi?.image_urls, [
    "https://www.flexicar.es/images/903000000237291/1.webp",
    "https://www.flexicar.es/images/903000000237291/2.webp",
    "https://www.flexicar.es/images/903000000237291/3.webp",
  ]);
  assert.deepEqual(seat?.image_urls, ["https://www.flexicar.es/images/903000000253626/1.webp"]);
});

test("Autocasión: palavras do card, particular, e o rodapé da página não conta", () => {
  const { listings } = parseAutocasion(fixture("autocasion-listagem.html"));
  const byId = new Map(listings.map((r) => [r.id, r]));
  const golf = byId.get(1001);
  assert.equal(golf?.vat_regime, "dedutivel");
  assert.equal(golf?.price_net, 16000);
  assert.equal(golf?.image_urls?.length, 2);
  assert.equal(byId.get(1002)?.vat_regime, "margem");
  assert.equal(byId.get(1003)?.vat_regime, "particular");
  // Último card: o pedaço até ao fim da página traz um link "Coches con IVA deducible" das
  // facetas — não é deste carro.
  assert.equal(byId.get(1004)?.vat_regime, null);
  assert.equal(byId.get(1004)?.price_net, null);
});

test("Trovit: palavras da descrição, imagens protocolo-relativas", () => {
  const { listings } = parseTrovit(fixture("trovit-listagem.html"));
  const byId = new Map(listings.map((r) => [r.id, r]));
  const zoe = byId.get("AAA111");
  assert.equal(zoe?.vat_regime, "dedutivel");
  assert.deepEqual(zoe?.image_urls, [
    "https://img-es-2.trovit.com/AAA111/AAA111.1_11.jpg",
    "https://img-es-2.trovit.com/AAA111/AAA111.2_11.jpg",
  ]);
  assert.equal(byId.get("BBB222")?.vat_regime, "margem");
  assert.equal(byId.get("CCC333")?.vat_regime, null);
});

test("Aramisauto: não mostra regime (FR §3.2) → null; a foto da listagem vai para image_urls", () => {
  const { listings } = parseAramis(fixture("aramisauto-listagem.html"));
  assert.equal(listings.length, 1);
  assert.equal(listings[0].vat_regime, null);
  assert.deepEqual(listings[0].image_urls, [
    "https://storage.googleapis.com/aramis_vehicles/974409/1.jpg",
  ]);
});

test("os registos encaixam no sink do P01 (vat_regime, price_net, image_urls)", () => {
  const golf = parseAutocasion(fixture("autocasion-listagem.html")).listings[0];
  assert.equal(vatRegime(golf.vat_regime), "dedutivel");
  assert.equal(priceNet(golf.price_net, golf.price), 16000);
  assert.deepEqual(imageUrls(golf as unknown as Record<string, unknown>), golf.image_urls);
  // Flexicar já tinha `images` (a galeria crua); o sink lê `image_urls` primeiro.
  const audi = parseFlexicar(fixture("flexicar-listagem.html")).listings[0];
  assert.deepEqual(imageUrls(audi as unknown as Record<string, unknown>), audi.image_urls);
});
