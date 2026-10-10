/**
 * Calculadora (P11): validação do formulário, procura por link e a conta.
 *
 * Só a metade pura de lib/calculator.ts — sem base de dados nem sessão. O
 * anúncio de exemplo é uma fixture com a forma da linha que a procura por link
 * lê (anúncio + estimativa), com a estimativa feita como o pipeline a faz
 * (scripts/pipeline/compute-costs.ts → computeCostBreakdown). Nada de pedidos
 * às fontes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TAX_TABLES_2026 } from "../../db/seed/isv-2026";
import {
  type CalculatorFields,
  EMPTY_FIELDS,
  type ListingLookupRow,
  calculate,
  listingToFields,
  listingUrlCandidates,
  parseAmount,
  parseCalculatorFields,
} from "../../lib/calculator";
import { computeCostBreakdown, computeDeal } from "../../lib/cost-engine";

const NOW = new Date("2026-10-10T12:00:00Z");

function fields(partial: Partial<CalculatorFields>): CalculatorFields {
  return {
    ...EMPTY_FIELDS,
    country: "DE",
    postalCode: "80331",
    price: "23 800",
    fuel: "diesel",
    displacementCc: "1995",
    co2: "128",
    firstRegistration: "2021-03-15",
    km: "62000",
    ptPrice: "30000",
    ...partial,
  };
}

function parsed(partial: Partial<CalculatorFields>) {
  const r = parseCalculatorFields(fields(partial), NOW);
  if (!r.ok) assert.fail(`não validou: ${JSON.stringify(r.errors)}`);
  return r.value;
}

// ── Números como os stands os escrevem ──────────────────────────

test("parseAmount: espaços, pontos de milhar, vírgula decimal e €", () => {
  assert.equal(parseAmount("23800"), 23800);
  assert.equal(parseAmount("23 800 €"), 23800);
  assert.equal(parseAmount("23.800"), 23800);
  assert.equal(parseAmount("1.234.567"), 1234567);
  assert.equal(parseAmount("23.800,50"), 23801);
  assert.equal(parseAmount("128"), 128);
  assert.equal(parseAmount("1.5"), 2); // ponto sem 3 dígitos a seguir é decimal
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("-500"), null);
});

// ── Validação ───────────────────────────────────────────────────

test("formulário vazio: erro claro em cada campo obrigatório", () => {
  const r = parseCalculatorFields({ ...EMPTY_FIELDS }, NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(Object.keys(r.errors).sort(), [
    "co2",
    "displacementCc",
    "firstRegistration",
    "km",
    "price",
    "ptPrice",
  ]);
  assert.equal(r.errors.price, "Indica o preço do anúncio.");
});

test("elétrico não pede cilindrada nem CO₂", () => {
  const p = parsed({ fuel: "elétrico", displacementCc: "", co2: "" });
  assert.equal(p.displacementCc, undefined);
  assert.equal(p.co2, undefined);
});

test("valores fora do normal são recusados", () => {
  const r = parseCalculatorFields(
    fields({
      price: "50",
      km: "9999999",
      displacementCc: "50000",
      firstRegistration: "2030-01-01",
    }),
    NOW,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.price && r.errors.km && r.errors.displacementCc && r.errors.firstRegistration);
});

test("país e combustível só dos valores conhecidos", () => {
  const r = parseCalculatorFields(fields({ country: "IT", fuel: "carvão" }), NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.country && r.errors.fuel);
});

test("Ceuta, Canárias e Córsega: o código postal é recusado", () => {
  for (const [country, postalCode] of [
    ["ES", "51001"],
    ["ES", "35001"],
    ["FR", "20000"],
    ["FR", "97200"],
  ]) {
    const r = parseCalculatorFields(fields({ country, postalCode }), NOW);
    assert.equal(r.ok, false, `${country} ${postalCode}`);
    if (!r.ok) assert.match(r.errors.postalCode ?? "", /território/);
  }
});

test("preço sem IVA maior do que o preço é recusado", () => {
  const r = parseCalculatorFields(fields({ vatRegime: "dedutivel", priceNet: "25000" }), NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.priceNet);
});

test("preço sem IVA só conta em dedutível", () => {
  assert.equal(parsed({ vatRegime: "margem", priceNet: "20000" }).priceNet, null);
  assert.equal(parsed({ vatRegime: "dedutivel", priceNet: "20.000" }).priceNet, 20000);
});

// ── A conta ─────────────────────────────────────────────────────

test("a conta é a do computeDeal, com veredito pela margem", () => {
  const p = parsed({});
  const r = calculate(p, TAX_TABLES_2026, { now: NOW });
  const { isvDetail: _, ...expected } = computeDeal(
    {
      originPrice: 23800,
      fuel: "diesel",
      displacementCc: 1995,
      co2: 128,
      firstRegistration: p.firstRegistration,
      country: "DE",
      referenceDate: NOW,
      sourceVatRegime: "margem",
      priceNet: null,
      postalCode: "80331",
      km: 62000,
    },
    30000,
    { tables: TAX_TABLES_2026 },
  );
  assert.deepEqual(r.deal, expected);
  assert.equal(r.deal.vatRegime, "margem");
  assert.equal(r.deal.originPriceNet, 23800);
  assert.equal(r.taxYear, 2026);
  assert.equal(r.provisional, false);
  assert.ok(["compensa", "marginal", "nao_compensa"].includes(r.verdict));
});

test("dedutível na DE: compra a preço ÷ 1,19 e revenda em regime normal", () => {
  const r = calculate(parsed({ vatRegime: "dedutivel" }), TAX_TABLES_2026, { now: NOW });
  assert.equal(r.deal.vatRegime, "dedutivel");
  assert.equal(r.deal.originPriceNet, 20000);
  assert.equal(r.deal.vatDeposit, 3800);
  assert.equal(r.deal.outputVat, Math.round((30000 * 23) / 123));
  assert.ok(r.notes.some((n) => n.includes("caução")));
});

test("NL dedutível sem preço sem IVA: conta em margem e diz porquê", () => {
  const r = calculate(
    parsed({ country: "NL", postalCode: "1012", vatRegime: "dedutivel" }),
    TAX_TABLES_2026,
    { now: NOW },
  );
  assert.equal(r.deal.vatRegime, "margem");
  assert.ok(r.notes.some((n) => n.includes("BPM")));
});

test("carro com 5 meses: meio de transporte novo, avisado", () => {
  const r = calculate(parsed({ firstRegistration: "2026-05-20", km: "20000" }), TAX_TABLES_2026, {
    now: NOW,
  });
  assert.equal(r.deal.newMeansOfTransport, true);
  assert.equal(r.deal.vatRegime, "dedutivel");
  assert.ok(r.notes.some((n) => n.includes("conta como novo")));
});

test("tabelas provisórias são assinaladas", () => {
  const r = calculate(
    parsed({}),
    { ...TAX_TABLES_2026, year: 2027, provisional: true },
    {
      now: NOW,
    },
  );
  assert.equal(r.taxYear, 2027);
  assert.equal(r.provisional, true);
});

// ── Por link ────────────────────────────────────────────────────

test("o link procura-se com e sem #, query e barra final", () => {
  const c = listingUrlCandidates(
    "  http://suchen.mobile.de/fahrzeuge/details.html?id=412345678&lang=pt#gallery ",
  );
  assert.ok(c);
  assert.ok(c.includes("https://suchen.mobile.de/fahrzeuge/details.html?id=412345678&lang=pt"));
  assert.ok(c.includes("https://suchen.mobile.de/fahrzeuge/details.html"));
  assert.ok(!c.some((u) => u.includes("#")));

  const d = listingUrlCandidates("https://www.autoscout24.be/fr/offres/bmw-320-abc123/");
  assert.ok(d?.includes("https://www.autoscout24.be/fr/offres/bmw-320-abc123"));
  assert.ok(d?.includes("https://www.autoscout24.be/fr/offres/bmw-320-abc123/"));
});

test("texto que não é link http(s) não chega à base", () => {
  assert.equal(listingUrlCandidates("BMW 320d 2021"), null);
  assert.equal(listingUrlCandidates("javascript:alert(1)"), null);
  assert.equal(listingUrlCandidates("ftp://exemplo.de/carro"), null);
});

/**
 * Fixture: um anúncio do mobile.de já na montra. O anúncio não traz CO₂; o
 * pipeline foi buscá-lo ao catálogo e gravou-o em `inputs`, que é o que a ficha
 * mostra.
 */
const MOBILE_DE_ROW: ListingLookupRow = {
  id: "0b6f8f5e-4d7a-4d39-9e1a-5b8f3c2a1d00",
  country: "DE",
  postal_code: "80331",
  price: 23800,
  km: 62000,
  year: 2021,
  fuel: "diesel",
  displacement_cc: 1995,
  co2: null,
  first_registration: null,
  inputs: { cc: 1995, co2: 128, fuel: "diesel", firstRegistration: "2021-07-01" },
  pt_estimated_price: 31500,
};

test("anúncio encontrado preenche o formulário com as specs que a ficha usou", () => {
  const f = listingToFields(MOBILE_DE_ROW);
  assert.equal(f.country, "DE");
  assert.equal(f.postalCode, "80331");
  assert.equal(f.price, "23800");
  assert.equal(f.co2, "128"); // do catálogo, via estimativa
  assert.equal(f.firstRegistration, "2021-07-01");
  assert.equal(f.ptPrice, "31500");
  assert.equal(f.vatRegime, "margem"); // a fonte não diz → margem (DEFAULT)
});

test("anúncio sem estimativa: specs do anúncio e 1 de julho do ano", () => {
  const f = listingToFields({ ...MOBILE_DE_ROW, co2: 131, inputs: null, pt_estimated_price: null });
  assert.equal(f.co2, "131");
  assert.equal(f.firstRegistration, "2021-07-01");
  assert.equal(f.ptPrice, "");
  assert.equal(
    listingToFields({ ...MOBILE_DE_ROW, inputs: null, first_registration: "2020-11-03" })
      .firstRegistration,
    "2020-11-03",
  );
});

test("os números batem com os da ficha para um anúncio que existe", () => {
  // A estimativa como o pipeline a grava (é o que a ficha mostra hoje).
  const ficha = computeCostBreakdown(
    {
      originPrice: 23800,
      fuel: "diesel",
      displacementCc: 1995,
      co2: 128,
      firstRegistration: new Date("2021-07-01"),
      country: "DE",
      referenceDate: NOW,
    },
    TAX_TABLES_2026,
  ).breakdown;

  const r = parseCalculatorFields(listingToFields(MOBILE_DE_ROW), NOW);
  if (!r.ok) return assert.fail(JSON.stringify(r.errors));
  const { deal, ptPrice } = calculate(r.value, TAX_TABLES_2026, { now: NOW });

  assert.equal(ptPrice, 31500);
  assert.equal(deal.originPrice, ficha.originPrice);
  assert.equal(deal.isv, ficha.isv);
  assert.equal(deal.iuc, ficha.iuc);
  // Munique (PLZ 8…) não tem suplemento: o transporte é o base, como na ficha.
  assert.equal(deal.transport, ficha.transport);
  // A ficha antiga junta despachante à legalização; a calculadora separa-os.
  assert.equal(deal.legalization + deal.despachante, ficha.legalization);
});
