/**
 * Extração de potência de texto livre (db-sink) — a potência é a assinatura
 * da designação do modelo e o matching estrito exige-a; muitas fontes só a
 * têm no texto da variante (caso real: theparking "840I 3.0 333 XDRIVE").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePowerFromText } from "../../tools/collector/lib/db-sink";

test("padrões cv/ch/hp/ps", () => {
  assert.equal(parsePowerFromText("1.6 CRDI 136CV Style"), 136);
  assert.equal(parsePowerFromText("Cooper SE 184 ch"), 184);
  assert.equal(parsePowerFromText("2.0 TDI 150 PS DSG"), 150);
  assert.equal(parsePowerFromText("135 hp automatic"), 135);
});

test("kW → cv", () => {
  assert.equal(parsePowerFromText("E 100 kW Elegance"), 136);
  assert.equal(parsePowerFromText("150kW Comfort"), 204);
});

test("padrão theparking: número após a cilindrada", () => {
  assert.equal(parsePowerFromText("BMW 8 SERIES 840I 3.0 333 XDRIVE"), 333);
  assert.equal(parsePowerFromText("1.5 116 Advantage"), 116);
});

test("sem falsos positivos", () => {
  assert.equal(parsePowerFromText("M8 COMPETITION"), null);
  assert.equal(parsePowerFromText("Pack M 2020"), null); // ano não é potência
  assert.equal(parsePowerFromText("48V Mild Hybrid"), null); // 48V não é kW nem cv
  assert.equal(parsePowerFromText("MY25 Vanguard"), null);
});
