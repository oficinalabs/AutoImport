/**
 * Parser do "precio al contado" — stands ES anunciam o financiado na montra
 * e escondem o preço de compra direta na descrição (caso real: BMW iX
 * Flexicar a 41.790€ financiado, "Precio al contado: 46790 euros").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePrecioContado } from "../../lib/engine/precio-contado";

test("formatos reais de contado nas descrições ES", () => {
  assert.equal(parsePrecioContado("… Precio al contado: 46790 euros …", 41790), 46790);
  assert.equal(parsePrecioContado("PRECIO AL CONTADO 46.790 €", 41790), 46790);
  assert.equal(parsePrecioContado("precio al contado: 20.490,00€ financiado 16.990€", 16990), 20490);
  assert.equal(parsePrecioContado("Al contado - 23 500 EUR", 21000), 23500);
  // caso real (Clio TCe 90 anunciado a 11.900 na montra AS24-ES):
  // "Fahrzeugbeschreibung: Precio al contado: 12900 euros"
  assert.equal(
    parsePrecioContado("Fahrzeugbeschreibung Precio al contado: 12900 euros", 11900),
    12900,
  );
});

test("guardas: só aceita valores plausíveis (≥ anunciado, ≤ 1,4×)", () => {
  // abaixo do anunciado → outro número qualquer, não contado
  assert.equal(parsePrecioContado("precio al contado: 30000", 41790), null);
  // absurdamente acima → não é o contado deste carro
  assert.equal(parsePrecioContado("precio al contado: 99999", 41790), null);
  // sem menção → null
  assert.equal(parsePrecioContado("Vehículo revisado, garantía 12 meses.", 41790), null);
  // menção sem número por perto → null
  assert.equal(parsePrecioContado("aceptamos pago al contado y financiado", 41790), null);
});

test("várias ocorrências: ganha o valor mais frequente", () => {
  const text =
    "Precio al contado: 46.790€ … condiciones … precio al contado 46.790 EUR … al contado: 46999";
  assert.equal(parsePrecioContado(text, 41790), 46790);
});
