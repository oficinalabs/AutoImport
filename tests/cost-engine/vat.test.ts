/**
 * Regime de IVA da compra e custo efetivo (lib/cost-engine/vat.ts). Regras dos
 * estudos por país (AutoImport-plano/paises/, out. 2026).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VAT_RATE_ORIGIN,
  VAT_RATE_PT,
  applicableRegime,
  originPriceNet,
  vatDeposit,
} from "../../lib/cost-engine/vat";

test("taxas: DE 19 %, FR 20 %, BE/NL/ES 21 %, PT 23 %", () => {
  assert.deepEqual(VAT_RATE_ORIGIN, { DE: 0.19, FR: 0.2, BE: 0.21, NL: 0.21, ES: 0.21 });
  assert.equal(VAT_RATE_PT, 0.23);
});

test("dedutível só se o anúncio o declarar e o stand tiver VIES", () => {
  assert.equal(applicableRegime("dedutivel", "DE", true), "dedutivel");
  assert.equal(applicableRegime("dedutivel", "DE", false), "margem");
});

test("margem, particular e sem menção → margem (o lado seguro)", () => {
  for (const source of ["margem", "particular", null, undefined] as const) {
    assert.equal(applicableRegime(source, "FR", true), "margem", String(source));
  }
});

test("NL dedutível sem preço líquido → margem (BPM fora da base do IVA)", () => {
  assert.equal(applicableRegime("dedutivel", "NL", true), "margem");
  assert.equal(applicableRegime("dedutivel", "NL", true, null), "margem");
  assert.equal(applicableRegime("dedutivel", "NL", true, 30000), "dedutivel");
});

test("custo efetivo: preço ÷ (1 + IVA da origem) quando dedutível, por país", () => {
  assert.equal(originPriceNet(23800, "DE", "dedutivel"), 20000);
  assert.equal(originPriceNet(24000, "FR", "dedutivel"), 20000);
  assert.equal(originPriceNet(24200, "BE", "dedutivel"), 20000);
  assert.equal(originPriceNet(24200, "ES", "dedutivel"), 20000);
});

test("custo efetivo: o preço líquido publicado manda sobre a divisão", () => {
  // NL: 36 000 € com BPM, 27 000 € excl. BTW publicado (≠ 36 000 / 1,21)
  assert.equal(originPriceNet(36000, "NL", "dedutivel", 27000), 27000);
});

test("custo efetivo em margem = preço anunciado", () => {
  assert.equal(originPriceNet(23800, "DE", "margem"), 23800);
  assert.equal(originPriceNet(23800, "DE", "margem", 20000), 23800);
});

test("caução = preço − líquido (0 em margem)", () => {
  assert.equal(vatDeposit(23800, 20000), 3800);
  assert.equal(vatDeposit(23800, 23800), 0);
});
