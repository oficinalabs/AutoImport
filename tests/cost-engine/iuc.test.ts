/**
 * IUC categoria B — fórmula: (cilindrada + CO₂ [+ adicional ≥2017]) × coef
 * + adicional gasóleo. Referências em db/seed/isv-2026.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TAX_TABLES_2026 } from "../../db/seed/isv-2026";
import { calculateIuc } from "../../lib/cost-engine/iuc";
import type { CostInput } from "../../lib/cost-engine/types";

const T = TAX_TABLES_2026;

function input(partial: Partial<CostInput>): CostInput {
  return {
    originPrice: 20000,
    fuel: "gasolina",
    displacementCc: 1498,
    co2: 120,
    firstRegistration: new Date("2022-01-15"),
    country: "DE",
    ...partial,
  };
}

test("diesel 2015, 1461 cm³, 119 g → 158,29 €/ano (calculapt.pt)", () => {
  // (63,74 + 65,15) × 1,15 + 10,07 = 158,29
  const r = calculateIuc(
    input({
      fuel: "diesel",
      displacementCc: 1461,
      co2: 119,
      firstRegistration: new Date("2015-06-01"),
    }),
    T,
  );
  assert.equal(r, 158.29);
});

test("matrícula ≥ 2017 soma a taxa adicional de CO₂ nos escalões altos", () => {
  // diesel 2019 WLTP, 1995 cm³, 250 g: (127,35 + 212,04 + 31,77) × 1,15 + 20,12
  const r = calculateIuc(
    input({
      fuel: "diesel",
      displacementCc: 1995,
      co2: 250,
      firstRegistration: new Date("2019-06-01"),
    }),
    T,
  );
  const esperado = Math.round(((127.35 + 212.04 + 31.77) * 1.15 + 20.12) * 100) / 100;
  assert.equal(r, esperado);
});

test("matrícula < 2017 não soma adicional CO₂ nem adicional gasóleo em gasolina", () => {
  // gasolina 2015 NEDC, 1995 cm³, 200 g: (127,35 + 212,04) × 1,15
  const r = calculateIuc(
    input({ displacementCc: 1995, co2: 200, firstRegistration: new Date("2015-06-01") }),
    T,
  );
  assert.equal(r, Math.round(339.39 * 1.15 * 100) / 100);
});

test("coeficiente por ano: 2007 → 1,00 · 2008 → 1,05 · 2009 → 1,10", () => {
  const base = { displacementCc: 1100, co2: 110 };
  const r2007 = calculateIuc(input({ ...base, firstRegistration: new Date("2007-09-01") }), T);
  const r2008 = calculateIuc(input({ ...base, firstRegistration: new Date("2008-06-01") }), T);
  const r2009 = calculateIuc(input({ ...base, firstRegistration: new Date("2009-06-01") }), T);
  // NEDC 110 g → 97,63 (escalão 121–180 não; 110 ≤ 120 → 65,15)
  const soma = 31.77 + 65.15;
  assert.equal(r2007, Math.round(soma * 1.0 * 100) / 100);
  assert.equal(r2008, Math.round(soma * 1.05 * 100) / 100);
  assert.equal(r2009, Math.round(soma * 1.1 * 100) / 100);
});

test("elétrico → IUC 0 (isento)", () => {
  const r = calculateIuc(input({ fuel: "elétrico", displacementCc: undefined, co2: undefined }), T);
  assert.equal(r, 0);
});
