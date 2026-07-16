/**
 * Extração de potência de texto livre (db-sink) — a potência é a assinatura
 * da designação do modelo e o matching estrito exige-a; muitas fontes só a
 * têm no texto da variante (caso real: theparking "840I 3.0 333 XDRIVE").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePowerFromText, powerHp } from "../../tools/collector/lib/db-sink";

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

// powerHp: cascata de campos estruturados antes do fallback de texto.
test("campo estruturado engine_power_cv (standvirtual)", () => {
  assert.equal(powerHp({ engine_power_cv: 150 }), 150);
  assert.equal(powerHp({ engine_power_cv: 320, variant: "Competition" }), 320);
});

test("campo estruturado power_ch (aramisauto)", () => {
  assert.equal(powerHp({ power_ch: 143 }), 143);
  // tax_horsepower (cavalos fiscais) nunca é lido como potência real
  assert.equal(powerHp({ power_ch: 136, tax_horsepower: 7 }), 136);
});

test("precedência: campos estruturados antes do texto", () => {
  // power_cv/engine_power_cv ganham ao número no texto da variante
  assert.equal(powerHp({ power_cv: 190, variant: "2.0 TDI 150" }), 190);
  assert.equal(powerHp({ engine_power_cv: 204, variant: "320d 190" }), 204);
});

test("fallback kW e depois texto quando não há CV estruturado", () => {
  assert.equal(powerHp({ power_kw: 110 }), 150); // 110 kW → 150 cv
  assert.equal(powerHp({ variant: "1.6 CRDI 136CV Style" }), 136);
  assert.equal(powerHp({ variant: "Select", engine: "SHS-P" }), null); // sem sinal
});

test("guarda de sanidade 20–2000 cv", () => {
  assert.equal(powerHp({ engine_power_cv: 5 }), null); // fiscal-like, fora do intervalo
  assert.equal(powerHp({ power_ch: 3000 }), null);
});
