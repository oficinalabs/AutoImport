/**
 * Casos de referência com valores esperados de fontes externas (ecoimport.pt,
 * caetano.pt/blog) cross-verificadas contra o folheto oficial da AT — ver
 * db/seed/isv-2026.ts. Tolerância ±1 € nos totais (arredondamentos).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TAX_TABLES_2026 } from "../../db/seed/isv-2026";
import { calculateIsv } from "../../lib/cost-engine/isv";
import type { CostInput } from "../../lib/cost-engine/types";

const T = TAX_TABLES_2026;
const REF = new Date("2026-07-14");

function input(partial: Partial<CostInput>): CostInput {
  return {
    originPrice: 20000,
    fuel: "gasolina",
    displacementCc: 1498,
    co2: 120,
    firstRegistration: new Date("2022-01-15"),
    country: "DE",
    referenceDate: REF,
    ...partial,
  };
}

function within(actual: number, expected: number, tol = 1) {
  assert.ok(Math.abs(actual - expected) <= tol, `esperado ${expected} ±${tol}, obtido ${actual}`);
}

// ── Casos de referência (fontes externas) ───────────────────────

test("componente cilindrada: 998 cm³ → 238,79 € (caetano.pt)", () => {
  const r = calculateIsv(input({ displacementCc: 998, co2: 100 }), T);
  within(r.cilindrada, 238.79, 0.01);
});

test("componente ambiental NEDC gasolina: 105 g → 98,46 € (caetano.pt)", () => {
  // matrícula 2016 → NEDC
  const r = calculateIsv(input({ co2: 105, firstRegistration: new Date("2016-06-01") }), T);
  assert.equal(r.norm, "nedc");
  within(r.ambiental, 98.46, 0.01);
});

test("VW Golf 1.5 TSI 2022 (1498 cm³, 128 g WLTP, 4–5 anos) → ISV 1.291,22 € (ecoimport.pt)", () => {
  const r = calculateIsv(
    input({ displacementCc: 1498, co2: 128, firstRegistration: new Date("2022-01-15") }),
    T,
  );
  assert.equal(r.norm, "wltp");
  assert.equal(r.reducaoPct, 43);
  // componentes: aritmética exata da tabela (o exemplo da ecoimport carrega
  // um desvio interno de ±1 € nas parcelas; o total fica dentro de ±1 €)
  within(r.cilindrada, 1498 * 5.61 - 6194.88, 0.01);
  within(r.ambiental, 128 * 5.27 - 619.17, 0.01);
  within(r.total, 1291.22);
});

test("BMW 520d 2021 (1995 cm³, 132 g WLTP diesel, 5–6 anos) → ISV 3.225,84 € (ecoimport.pt)", () => {
  const r = calculateIsv(
    input({
      fuel: "diesel",
      displacementCc: 1995,
      co2: 132,
      firstRegistration: new Date("2021-05-01"),
    }),
    T,
  );
  assert.equal(r.reducaoPct, 52);
  assert.equal(r.agravamentoDiesel, 500);
  within(r.cilindrada, 1995 * 5.61 - 6194.88, 0.01);
  within(r.ambiental, 132 * 65.04 - 7360.85, 0.01);
  within(r.total, 3225.84);
});

test("elétrico → ISV 0 (isento)", () => {
  const r = calculateIsv(input({ fuel: "elétrico", displacementCc: undefined, co2: undefined }), T);
  assert.equal(r.total, 0);
});

// ── Fronteiras de escalão (cilindrada) ──────────────────────────

test("fronteira 1000/1001 cm³", () => {
  const a = calculateIsv(input({ displacementCc: 1000, co2: 100 }), T);
  const b = calculateIsv(input({ displacementCc: 1001, co2: 100 }), T);
  within(a.cilindrada, 1000 * 1.09 - 849.03, 0.01);
  within(b.cilindrada, 1001 * 1.18 - 850.69, 0.01);
});

test("fronteira 1250/1251 cm³", () => {
  const a = calculateIsv(input({ displacementCc: 1250, co2: 100 }), T);
  const b = calculateIsv(input({ displacementCc: 1251, co2: 100 }), T);
  within(a.cilindrada, 1250 * 1.18 - 850.69, 0.01);
  within(b.cilindrada, 1251 * 5.61 - 6194.88, 0.01);
});

test("componente negativa é cortada a 0 (CO₂ baixo, escalão base)", () => {
  // 45 g WLTP gasolina: 45×0,44 − 43,02 < 0 → 0
  const r = calculateIsv(input({ co2: 45, firstRegistration: new Date("2023-03-01") }), T);
  assert.equal(r.ambiental, 0);
});

// ── Taxas intermédias e redução ─────────────────────────────────

test("phev CO₂ < 50 g → taxa 25%, redução aplicada depois", () => {
  const r = calculateIsv(
    input({
      fuel: "phev",
      displacementCc: 1995,
      co2: 45,
      firstRegistration: new Date("2025-10-01"),
    }),
    T,
  );
  assert.equal(r.taxaPct, 25);
  assert.equal(r.reducaoPct, 10);
  // (4996,07 + 0) × 0,25 × 0,90
  within(r.total, 4996.07 * 0.25 * 0.9);
});

test("phev CO₂ ≥ 50 g (pré Euro 6e-bis) → taxa normal 100%", () => {
  const r = calculateIsv(
    input({ fuel: "phev", co2: 68, firstRegistration: new Date("2023-06-01") }),
    T,
  );
  assert.equal(r.taxaPct, 100);
});

test("phev usado 2015–2020 → taxa 25% sem limite de CO₂", () => {
  const r = calculateIsv(
    input({ fuel: "phev", co2: 70, firstRegistration: new Date("2018-06-01") }),
    T,
  );
  assert.equal(r.taxaPct, 25);
});

test("híbrido convencional (CO₂ ≥ 50 g) já não tem taxa intermédia", () => {
  const r = calculateIsv(
    input({ fuel: "híbrido", co2: 102, firstRegistration: new Date("2021-06-01") }),
    T,
  );
  assert.equal(r.taxaPct, 100);
});

test("mais de 10 anos → redução 80%", () => {
  const r = calculateIsv(input({ firstRegistration: new Date("2014-01-01"), co2: 130 }), T);
  assert.equal(r.reducaoPct, 80);
});

test("não-elétrico sem cilindrada/CO₂ → erro (nunca adivinhar)", () => {
  assert.throws(() => calculateIsv(input({ displacementCc: undefined }), T));
  assert.throws(() => calculateIsv(input({ co2: undefined }), T));
});
