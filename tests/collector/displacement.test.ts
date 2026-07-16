/**
 * Cilindrada de texto livre (db-sink `displacementCc`). O bug: "V8 4.4 Gasoline"
 * dava 844cc (o strip de dígitos apanhava 8,4,4). O token de litros isolado
 * `\b[1-9][.,]\d\b(?!\d)` tem prioridade sobre o strip, exceto num cm³ com
 * separador de milhares ("1.995"), onde não há fronteira antes do 3.º dígito.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { displacementCc } from "../../tools/collector/lib/db-sink";

test("litros em qualquer posição têm prioridade sobre o strip de dígitos", () => {
  assert.equal(displacementCc("V8 4.4 Gasoline"), 4400); // não 844
  assert.equal(displacementCc("V6 2.9 Hybrid"), 2900); // não 629
  assert.equal(displacementCc("3.0 TDI"), 3000);
  assert.equal(displacementCc("2,0 l"), 2000);
});

test("cm³ com separador de milhares / inteiro puro → strip de dígitos", () => {
  assert.equal(displacementCc("1.995 cm³"), 1995);
  assert.equal(displacementCc("1995"), 1995);
  assert.equal(displacementCc(1995), 1995);
});

test("sem cilindrada legível → null (com guarda 400–8500)", () => {
  assert.equal(displacementCc("TDI"), null);
  assert.equal(displacementCc(null), null);
  assert.equal(displacementCc("0.6 Gasoline"), null); // <1.0 L não é litragem válida
});
