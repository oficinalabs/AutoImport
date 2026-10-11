/** "Meio de transporte novo": ≤ 6 000 km OU ≤ 6 meses (RITI art. 6.º; estudos §3.5). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewMeansOfTransport } from "../../lib/cost-engine/new-vehicle";

const REF = new Date("2026-10-10");

test("5 meses e 20 000 km → novo (a data basta)", () => {
  assert.equal(isNewMeansOfTransport(20000, new Date("2026-05-10"), REF), true);
});

test("3 anos e 5 000 km → novo (os km bastam)", () => {
  assert.equal(isNewMeansOfTransport(5000, new Date("2023-10-10"), REF), true);
});

test("limites incluídos: 6 000 km e exatamente 6 meses → novo", () => {
  assert.equal(isNewMeansOfTransport(6000, new Date("2020-01-01"), REF), true);
  assert.equal(isNewMeansOfTransport(50000, new Date("2026-04-10"), REF), true);
});

test("> 6 meses e > 6 000 km → usado", () => {
  assert.equal(isNewMeansOfTransport(6001, new Date("2026-04-09"), REF), false);
  assert.equal(isNewMeansOfTransport(80000, new Date("2021-03-01"), REF), false);
});

test("sem km e sem data → não se afirma que é novo", () => {
  assert.equal(isNewMeansOfTransport(null, null, REF), false);
  assert.equal(isNewMeansOfTransport(undefined, undefined, REF), false);
});

test("sem km: decide a data", () => {
  assert.equal(isNewMeansOfTransport(null, new Date("2026-08-01"), REF), true);
  assert.equal(isNewMeansOfTransport(null, new Date("2025-08-01"), REF), false);
});
