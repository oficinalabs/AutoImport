/** Legalização em PT: oficial ≈ 205 € com COC + despachante (estudo PT §5). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESPACHANTE_DEFAULT_EUR,
  LEGALIZATION_IMT_SEM_COC_EUR,
  LEGALIZATION_OFFICIAL_EUR,
  estimateLegalization,
} from "../../lib/cost-engine/legalization";

test("com COC: inspeção 93,52 + IMT 45 + registo 46,80 + chapas 20 ≈ 205 €", () => {
  assert.equal(LEGALIZATION_OFFICIAL_EUR.inspecaoModelo112, 93.52);
  assert.equal(LEGALIZATION_OFFICIAL_EUR.imtComCoc, 45);
  assert.equal(LEGALIZATION_OFFICIAL_EUR.registo, 46.8);
  assert.equal(estimateLegalization(), 205);
  assert.equal(estimateLegalization({ coc: true }), 205);
});

test("sem COC: o IMT cobra 165 € → 325 €", () => {
  assert.equal(LEGALIZATION_IMT_SEM_COC_EUR, 165);
  assert.equal(estimateLegalization({ coc: false }), 325);
});

test("despachante por defeito: 250 € (mínimo do intervalo 250–500 €)", () => {
  assert.equal(DESPACHANTE_DEFAULT_EUR, 250);
});
