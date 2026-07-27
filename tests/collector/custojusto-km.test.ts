/**
 * km do CustoJusto (best-effort por regex sobre título+corpo do anúncio).
 * O bug real: o corredor `\d[\d.\s]{2,}` colava o número que vinha antes dos km
 * ("2018 175.748 km" → 2018175748 = ano + km). 10 registos em 32k saíam absurdos e um
 * deles (4020237000) nem cabia no int4 do Postgres — o anúncio perdia-se no ingest.
 * Regra: um valor implausível é AUSENTE (null), nunca truncado.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKm } from "../../tools/collector/custojusto/schema";

test("formatos normais de quilometragem", () => {
  assert.equal(parseKm("VW Polo 133.000 km"), 133000); // ponto = milhares
  assert.equal(parseKm("176000 Km"), 176000); // inteiro corrido, maiúsculas
  assert.equal(parseKm("217 828 km"), 217828); // espaço = milhares
  assert.equal(parseKm("1.234.567 km"), 1234567);
});

test("não cola o número que vem antes dos km", () => {
  assert.equal(parseKm("VW Polo Comfortline 2018 175.748 km"), 175748); // não 2018175748
  assert.equal(parseKm("Peugeot 2008 de 2007, 342.000 km"), 342000); // não 2007342000
});

test("valor implausível → null (ausente), nunca truncado", () => {
  assert.equal(parseKm("4.020.237.000 km"), null); // > int4, o registo que se perdia
  assert.equal(parseKm("3 144 900 km"), null); // cabe no int4 mas não é um odómetro
  assert.equal(parseKm("4020237000 km"), null);
});

test("sem quilometragem legível → null", () => {
  assert.equal(parseKm("BMW Serie 1 118d"), null);
  assert.equal(parseKm(null, undefined), null);
});

test("percorre os vários textos até encontrar um km plausível", () => {
  assert.equal(parseKm("Audi A4 9.999.999 km", "impecável, 210.000 km"), 210000);
});
