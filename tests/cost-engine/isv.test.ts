/**
 * Casos de referência com valores esperados de fontes externas (ecoimport.pt,
 * caetano.pt/blog) cross-verificadas contra o folheto oficial da AT — ver
 * db/seed/isv-2026.ts. Tolerância ±1 € nos totais (arredondamentos).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ISV_TABLES_2026, TAX_TABLES_2026 } from "../../db/seed/isv-2026";
import { ISV_TABLES_2027, TAX_TABLES_2027 } from "../../db/seed/isv-2027";
import { ISV_MINIMO_APOS_REDUCAO, ISV_MINIMO_EUR, calculateIsv } from "../../lib/cost-engine/isv";
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

test("Lamborghini Huracán Evo Spyder 2023 (5204 cm³, 338 g WLTP, 3–4 anos) → ISV 39.075,65 €", () => {
  // Caso real do topo da montra (autocasion.com, 44.500 km) — os escalões do
  // topo não têm limite superior e nenhum outro teste passava de 2,0 L / 150 g.
  // Especificado ao euro contra a produção: a poupança daquele anúncio estava
  // errada por causa da amostra PT, NÃO do ISV.
  const r = calculateIsv(
    input({ displacementCc: 5204, co2: 338, firstRegistration: new Date("2023-07-01") }),
    T,
  );
  assert.equal(r.norm, "wltp");
  assert.equal(r.reducaoPct, 35);
  within(r.cilindrada, 5204 * 5.61 - 6194.88, 0.01);
  within(r.ambiental, 338 * 233.81 - 41910.96, 0.01);
  within(r.total, 39075.65, 0.01);
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

// ── Componente ambiental negativa e mínimo (CISV art. 7.º n.º 4) ─

test("componente ambiental negativa abate à cilindrada", () => {
  // 95 g WLTP gasolina: 95×0,44 − 43,02 = −1,22; 1498 cm³ → 2.208,90; 3–4 anos (35%)
  const r = calculateIsv(input({ co2: 95, firstRegistration: new Date("2023-03-01") }), T);
  within(r.ambiental, -1.22, 0.01);
  within(r.total, (2208.9 - 1.22) * 0.65, 0.01);
});

test("compensação que leva o total abaixo de 100 € → ISV mínimo de 100 €", () => {
  // NEDC gasolina 60 g: 60×4,62 − 427 = −149,80; 998 cm³ → 238,79; base 88,99
  const r = calculateIsv(
    input({ displacementCc: 998, co2: 60, firstRegistration: new Date("2016-06-01") }),
    T,
  );
  within(r.ambiental, -149.8, 0.01);
  assert.equal(r.reducaoPct, 80);
  assert.equal(r.total, ISV_MINIMO_EUR);
});

test("mínimo de 100 € depois da redução por antiguidade (DEFAULT conservador)", () => {
  // 998 cm³, NEDC 99 g, > 10 anos: (238,79 + 30,38) × 0,20 = 53,83 → 100
  assert.equal(ISV_MINIMO_APOS_REDUCAO, true);
  const r = calculateIsv(
    input({ displacementCc: 998, co2: 99, firstRegistration: new Date("2014-01-01") }),
    T,
  );
  assert.equal(r.reducaoPct, 80);
  assert.equal(r.total, 100);
});

test("elétrico continua a 0 (não sujeito, o mínimo não se aplica)", () => {
  const r = calculateIsv(input({ fuel: "elétrico", displacementCc: undefined, co2: undefined }), T);
  assert.equal(r.total, 0);
});

// ── Aviso de mudança de escalão da Tabela D ─────────────────────

test("muda de escalão nos próximos 45 dias → aviso com a data e o ISV seguinte", () => {
  // Golf 1498 cm³ / 128 g, 1.ª matrícula 01/08/2022, referência 14/07/2026:
  // 35% hoje; a 01/08/2026 passa a 43% → 2.264,29 × 0,57 = 1.290,64 €
  const r = calculateIsv(
    input({ displacementCc: 1498, co2: 128, firstRegistration: new Date("2022-08-01") }),
    T,
  );
  assert.equal(r.reducaoPct, 35);
  const aviso = r.assumptions.find((a) => a.startsWith("idade:"));
  assert.ok(aviso, `sem aviso: ${r.assumptions.join(" | ")}`);
  assert.match(aviso, /a partir de 01\/08\/2026/);
  assert.match(aviso, /desce para 1291 €/);
  assert.match(aviso, /35% → 43%/);
});

test("mudança de escalão a mais de 45 dias → sem aviso", () => {
  // 1.ª matrícula 01/10/2022 → muda a 01/10/2026 (79 dias depois de 14/07)
  const r = calculateIsv(input({ firstRegistration: new Date("2022-10-01") }), T);
  assert.ok(!r.assumptions.some((a) => a.startsWith("idade:")));
});

test("já no último escalão (> 10 anos) → sem aviso", () => {
  const r = calculateIsv(input({ firstRegistration: new Date("2016-07-20"), co2: 130 }), T);
  assert.equal(r.reducaoPct, 75);
  // a 20/07/2026 faz 10 anos → aviso; com 11 anos já não há escalão seguinte
  assert.ok(r.assumptions.some((a) => a.startsWith("idade:")));
  const velho = calculateIsv(input({ firstRegistration: new Date("2015-07-20"), co2: 130 }), T);
  assert.equal(velho.reducaoPct, 80);
  assert.ok(!velho.assumptions.some((a) => a.startsWith("idade:")));
});

test("aviso não aparece quando o mínimo já trava o valor", () => {
  // 998 cm³, NEDC 99 g, faz 10 anos a 01/08/2026: 75% → 80%, mas ambos dão 100 €
  const r = calculateIsv(
    input({ displacementCc: 998, co2: 99, firstRegistration: new Date("2016-08-01") }),
    T,
  );
  assert.equal(r.total, 100);
  assert.ok(!r.assumptions.some((a) => a.startsWith("idade:")));
});

// ── Tabelas 2027 (provisórias) ──────────────────────────────────

test("tabelas 2027 = 2026 (provisórias, OE 2027 sem alteração de taxas)", () => {
  const { year: y26, ...t26 } = TAX_TABLES_2026;
  const { year: y27, ...t27 } = TAX_TABLES_2027;
  assert.equal(y26, 2026);
  assert.equal(y27, 2027);
  assert.deepEqual(t27, t26);

  const kinds26 = ISV_TABLES_2026.map((t) => t.kind);
  const rows27 = ISV_TABLES_2027.filter((t) => t.kind !== "tabelas_meta");
  assert.deepEqual(
    rows27.map((t) => t.kind),
    kinds26,
  );
  assert.ok(ISV_TABLES_2027.every((t) => t.year === 2027));
  const meta = ISV_TABLES_2027.find((t) => t.kind === "tabelas_meta");
  assert.deepEqual(meta?.payload, { provisional: true });
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
  // (4996,07 − 23,22) × 0,25 × 0,90 — a ambiental (45×0,44 − 43,02) é negativa
  // e abate à cilindrada (art. 7.º n.º 4)
  within(r.total, (4996.07 - 23.22) * 0.25 * 0.9);
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
