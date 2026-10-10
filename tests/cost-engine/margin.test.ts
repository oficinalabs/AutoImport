/**
 * IVA de saída, margem bruta, veredito por margem e `computeDeal`.
 * O exemplo de referência é o do estudo PT §3.3: PVP 30 000 €, ISV 2 000 €,
 * transporte 1 100 €, legalização 300 €, sem IUC/despachante/preparação.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TAX_TABLES_2026 } from "../../db/seed/isv-2026";
import { computeCostBreakdown, computeDeal } from "../../lib/cost-engine";
import { PREPARATION_DEFAULT_EUR, grossMargin, outputVat } from "../../lib/cost-engine/margin";
import type { DealInput } from "../../lib/cost-engine/types";
import { DEFAULT_MARGIN_THRESHOLDS, verdictFromMargin } from "../../lib/verdict";

// ── Exemplo do estudo PT §3.3 ───────────────────────────────────

const PVP = 30000;
const COSTS = 2000 + 1100 + 300; // ISV + transporte + legalização

test("PT §3.3 A — 'MwSt. ausweisbar' 23 800 € (20 000 € netto): lucro 990,24 €", () => {
  const r = grossMargin("dedutivel", PVP, 23800, 20000 + COSTS);
  assert.equal(r.outputVat, 5609.76);
  assert.equal(r.grossMargin, 990.24);
});

test("PT §3.3 B — 'Differenzbesteuert' 23 800 €: lucro 1 640,65 €", () => {
  const r = grossMargin("margem", PVP, 23800, 23800 + COSTS);
  assert.equal(r.outputVat, 1159.35);
  assert.equal(r.grossMargin, 1640.65);
});

test("margem: PVP abaixo do preço de compra → IVA de saída 0", () => {
  assert.equal(outputVat("margem", 20000, 23800), 0);
});

test("margem bruta em % do PVP, 1 casa decimal", () => {
  assert.equal(grossMargin("margem", PVP, 23800, 23800 + COSTS).grossMarginPct, 5.5);
});

// ── Veredito por margem ─────────────────────────────────────────

test("veredito: compensa ≥ 1 500 € e ≥ 6 %; marginal ≥ 500 €", () => {
  assert.equal(verdictFromMargin(1500, 6), "compensa");
  assert.equal(verdictFromMargin(3000, 5.9), "marginal"); // € chega, % não
  assert.equal(verdictFromMargin(1499, 10), "marginal");
  assert.equal(verdictFromMargin(500, 2), "marginal");
  assert.equal(verdictFromMargin(499, 20), "nao_compensa");
  assert.equal(verdictFromMargin(-800, -4), "nao_compensa");
});

test("veredito: limiares do stand substituem os defaults", () => {
  const t = { ...DEFAULT_MARGIN_THRESHOLDS, compensaEur: 1000, compensaPct: 4 };
  assert.equal(verdictFromMargin(1200, 5, t), "compensa");
});

// ── computeDeal ─────────────────────────────────────────────────

const REF = new Date("2026-10-10");

function car(partial: Partial<DealInput>): DealInput {
  return {
    originPrice: 23800,
    fuel: "gasolina",
    displacementCc: 1498,
    co2: 120,
    firstRegistration: new Date("2022-01-15"),
    country: "DE",
    km: 60000,
    referenceDate: REF,
    ...partial,
  };
}

/** Custos fixos do exemplo PT §3.3 (ISV/IUC vêm das tabelas). */
const EXAMPLE = {
  tables: TAX_TABLES_2026,
  transport: 1100,
  legalization: 300,
  despachante: 0,
  preparation: 0,
};

function assertSums(r: ReturnType<typeof computeDeal>, ptPrice: number) {
  assert.equal(
    r.totalPt,
    r.originPriceNet + r.transport + r.isv + r.iuc + r.legalization + r.despachante + r.preparation,
  );
  assert.ok(Math.abs(r.grossMargin - (ptPrice - r.outputVat - r.totalPt)) <= 1);
}

test("computeDeal reproduz o estudo PT §3.3 (A e B) com o ISV/IUC das tabelas", () => {
  const a = computeDeal(car({ sourceVatRegime: "dedutivel" }), PVP, EXAMPLE);
  const b = computeDeal(car({ sourceVatRegime: "margem" }), PVP, EXAMPLE);
  assert.equal(a.vatRegime, "dedutivel");
  assert.equal(a.originPriceNet, 20000);
  assert.equal(a.vatDeposit, 3800);
  assert.equal(a.outputVat, 5610);
  assert.equal(b.vatRegime, "margem");
  assert.equal(b.originPriceNet, 23800);
  assert.equal(b.vatDeposit, 0);
  assert.equal(b.outputVat, 1159);
  // As margens do estudo menos o ISV/IUC reais (o estudo usa ISV 2 000 € e sem IUC)
  const extraA = a.isv + a.iuc - 2000;
  const extraB = b.isv + b.iuc - 2000;
  assert.ok(Math.abs(a.grossMargin - (990.24 - extraA)) <= 1, `A: ${a.grossMargin}`);
  assert.ok(Math.abs(b.grossMargin - (1640.65 - extraB)) <= 1, `B: ${b.grossMargin}`);
  assertSums(a, PVP);
  assertSums(b, PVP);
});

test("computeDeal: defaults de despachante (250 €) e preparação (300 €)", () => {
  const r = computeDeal(car({}), PVP, { tables: TAX_TABLES_2026 });
  assert.equal(r.despachante, 250);
  assert.equal(r.preparation, PREPARATION_DEFAULT_EUR);
  assert.equal(r.legalization, 205);
  assertSums(r, PVP);
});

test("computeDeal: um caso por país, dedutível com VIES", () => {
  const cases = [
    { country: "DE", price: 23800, net: 20000, postalCode: "80331", transport: 950 },
    { country: "FR", price: 24000, net: 20000, postalCode: "69001", transport: 775 },
    { country: "BE", price: 24200, net: 20000, postalCode: "1000", transport: 950 },
    { country: "ES", price: 24200, net: 20000, postalCode: "28001", transport: 550 },
  ] as const;
  for (const c of cases) {
    const r = computeDeal(
      car({
        country: c.country,
        originPrice: c.price,
        postalCode: c.postalCode,
        sourceVatRegime: "dedutivel",
      }),
      PVP,
      { tables: TAX_TABLES_2026 },
    );
    assert.equal(r.vatRegime, "dedutivel", c.country);
    assert.equal(r.originPriceNet, c.net, c.country);
    assert.equal(r.vatDeposit, c.price - c.net, c.country);
    assert.equal(r.transport, c.transport, c.country);
    assert.equal(r.outputVat, 5610, c.country);
    assertSums(r, PVP);
  }
});

test("computeDeal NL: dedutível com preço líquido usa-o; sem ele é margem", () => {
  const withNet = computeDeal(
    car({ country: "NL", originPrice: 36000, priceNet: 27000, sourceVatRegime: "dedutivel" }),
    40000,
    { tables: TAX_TABLES_2026 },
  );
  assert.equal(withNet.vatRegime, "dedutivel");
  assert.equal(withNet.originPriceNet, 27000);
  assert.equal(withNet.transport, 1000);

  const noNet = computeDeal(
    car({ country: "NL", originPrice: 36000, sourceVatRegime: "dedutivel" }),
    40000,
    { tables: TAX_TABLES_2026 },
  );
  assert.equal(noNet.vatRegime, "margem");
  assert.equal(noNet.originPriceNet, 36000);
  assert.equal(noNet.vatDeposit, 0);
});

test("computeDeal: stand sem VIES → margem mesmo com anúncio dedutível", () => {
  const r = computeDeal(car({ sourceVatRegime: "dedutivel" }), PVP, {
    tables: TAX_TABLES_2026,
    standVatRegistered: false,
  });
  assert.equal(r.vatRegime, "margem");
  assert.equal(r.originPriceNet, 23800);
});

test("computeDeal: carro com 5 meses e 20 000 km é novo → revenda em regime normal", () => {
  const r = computeDeal(
    car({ firstRegistration: new Date("2026-05-10"), km: 20000, sourceVatRegime: "margem" }),
    PVP,
    { tables: TAX_TABLES_2026 },
  );
  assert.equal(r.newMeansOfTransport, true);
  assert.equal(r.vatRegime, "dedutivel");
  assert.equal(r.originPriceNet, 23800); // o anúncio não deu IVA dedutível: paga-se o preço
  assert.equal(r.outputVat, 5610);
});

test("computeDeal: sem COC a legalização sobe 120 € (IMT 165 € em vez de 45 €)", () => {
  const coc = computeDeal(car({}), PVP, { tables: TAX_TABLES_2026 });
  const noCoc = computeDeal(car({}), PVP, { tables: TAX_TABLES_2026, coc: false });
  assert.equal(noCoc.legalization - coc.legalization, 120);
});

test("computeCostBreakdown mantém a assinatura antiga (pipeline atual)", () => {
  const { breakdown, isvDetail } = computeCostBreakdown(car({}), TAX_TABLES_2026);
  assert.equal(breakdown.originPrice, 23800);
  assert.equal(breakdown.transport, 950);
  assert.equal(breakdown.legalization, 205 + 250);
  assert.equal(
    breakdown.totalPt,
    breakdown.originPrice +
      breakdown.transport +
      breakdown.isv +
      breakdown.iuc +
      breakdown.legalization,
  );
  assert.ok(isvDetail.total >= 0);
});
