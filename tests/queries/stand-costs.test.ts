/**
 * Custos próprios do stand (P09).
 *
 * Duas metades:
 *  - `applyStandCosts` (puro): um stand sem definições vê EXATAMENTE os números
 *    publicados; com definições, a conta é a mesma que o `computeDeal` faria com
 *    esses custos, e o veredito usa o limiar do stand.
 *  - gravar/ler (`stand_cost_settings`, base descartável): só o dono grava, e o
 *    servidor recusa valores inválidos. Só corre contra Postgres LOCAL.
 *
 * ⚠️ `process.env.WAREHOUSE_URL` tem de ser definido ANTES de qualquer
 * `await import` do `db/`: o db/index.ts congela a connection string no import.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { TAX_TABLES_2026 } from "../../db/seed/isv-2026";
import { computeDeal } from "../../lib/cost-engine";
import type { DealInput, DealResult } from "../../lib/cost-engine/types";
import { dbUrl } from "../../lib/db-url";
import {
  EMPTY_STAND_COSTS,
  type StandCostSettings,
  applyStandCosts,
  checkStandCosts,
  isEmptyStandCosts,
} from "../../lib/stand-costs";
import type { Listing } from "../../lib/types";
import { verdictFromMargin } from "../../lib/verdict";
import {
  dropDatabases,
  migrate,
  recreateDatabases,
  skipUnlessLocalDb,
  withDbName,
} from "../helpers/db";

// ── Fixtures ────────────────────────────────────────────────────

const PT_PRICE = 30000;

/** Um carro alemão com IVA dedutível, calculado pelo motor como o P06 publica. */
const CARRO: DealInput = {
  originPrice: 23800,
  fuel: "gasolina",
  displacementCc: 1498,
  co2: 130,
  firstRegistration: new Date("2022-03-01"),
  referenceDate: new Date("2026-10-10"),
  country: "DE",
  postalCode: "80331",
  km: 45000,
  sourceVatRegime: "dedutivel",
};

/** O anúncio tal como a app o lê da montra, a partir de uma conta do motor. */
function listingFrom(deal: DealResult, over: Partial<Listing> = {}): Listing {
  const savings = PT_PRICE - deal.totalPt;
  return {
    id: "l1",
    model: { id: "m1", make: "BMW", model: "Série 1", fuel: "gasolina", transmission: null },
    title: "BMW 118i",
    year: 2022,
    km: 45000,
    country: "DE",
    source: "AutoScout24",
    images: [],
    cost: {
      originPrice: deal.originPrice,
      transport: deal.transport,
      isv: deal.isv,
      iuc: deal.iuc,
      legalization: deal.legalization,
      totalPt: deal.totalPt,
      vatRegime: deal.vatRegime,
      originPriceNet: deal.originPriceNet,
      vatDeposit: deal.vatDeposit,
      preparation: deal.preparation,
      despachante: deal.despachante,
      outputVat: deal.outputVat,
      grossMargin: deal.grossMargin,
      grossMarginPct: deal.grossMarginPct,
    },
    ptMarket: { estimatedPrice: PT_PRICE, sampleSize: 12, history: [] },
    savings,
    savingsPct: Math.round((savings / PT_PRICE) * 1000) / 10,
    verdict: verdictFromMargin(deal.grossMargin, deal.grossMarginPct),
    kmTrust: { level: "por_verificar" },
    seenAt: "2026-10-10T00:00:00Z",
    isFavorite: false,
    sourceVatRegime: "dedutivel",
    ...over,
  };
}

const publicado = computeDeal(CARRO, PT_PRICE, { tables: TAX_TABLES_2026 });
const ANUNCIO = listingFrom(publicado);

const custos = (s: Partial<StandCostSettings>): StandCostSettings => ({
  ...EMPTY_STAND_COSTS,
  ...s,
});

/** Os números da conta, para comparar com o motor sem os campos de apresentação. */
const numeros = (l: Listing) => ({
  totalPt: l.cost.totalPt,
  originPriceNet: l.cost.originPriceNet,
  outputVat: l.cost.outputVat,
  grossMargin: l.cost.grossMargin,
  grossMarginPct: l.cost.grossMarginPct,
});
const numerosDeal = (d: DealResult) => ({
  totalPt: d.totalPt,
  originPriceNet: d.originPriceNet,
  outputVat: d.outputVat,
  grossMargin: d.grossMargin,
  grossMarginPct: d.grossMarginPct,
});

// ── applyStandCosts ─────────────────────────────────────────────

test("sem definições: o mesmo anúncio, com os números publicados", () => {
  assert.equal(applyStandCosts(ANUNCIO, null), ANUNCIO);
  assert.equal(applyStandCosts(ANUNCIO, EMPTY_STAND_COSTS), ANUNCIO);
  assert.ok(isEmptyStandCosts(null));
  assert.ok(isEmptyStandCosts(EMPTY_STAND_COSTS));
});

test("definições só de outro país: os números ficam iguais aos publicados", () => {
  const r = applyStandCosts(ANUNCIO, custos({ transport: { FR: 900 } }));
  assert.deepEqual(numeros(r), numeros(ANUNCIO));
  assert.equal(r.verdict, ANUNCIO.verdict);
  assert.deepEqual(r.standCosts, []);
});

test("custos do stand: a conta é a que o computeDeal faria com eles", () => {
  const s = custos({
    transport: { DE: 1500 },
    legalization: 230,
    despachante: 400,
    preparation: 600,
  });
  const r = applyStandCosts(ANUNCIO, s);
  const esperado = computeDeal(CARRO, PT_PRICE, {
    tables: TAX_TABLES_2026,
    transport: 1500,
    legalization: 230,
    despachante: 400,
    preparation: 600,
  });
  assert.deepEqual(numeros(r), numerosDeal(esperado));
  assert.equal(r.cost.transport, 1500);
  assert.equal(r.cost.isv, ANUNCIO.cost.isv, "o ISV não depende do stand");
  assert.equal(r.savings, PT_PRICE - esperado.totalPt);
  assert.deepEqual(r.standCosts, ["transport", "legalization", "despachante", "preparation"]);
  assert.ok((r.cost.grossMargin ?? 0) < (ANUNCIO.cost.grossMargin ?? 0));
});

test("stand sem VIES: o dedutível passa a margem, como no computeDeal", () => {
  assert.equal(ANUNCIO.cost.vatRegime, "dedutivel");
  const r = applyStandCosts(ANUNCIO, custos({ vatRegistered: false }));
  const esperado = computeDeal(CARRO, PT_PRICE, {
    tables: TAX_TABLES_2026,
    standVatRegistered: false,
  });
  assert.equal(r.cost.vatRegime, "margem");
  assert.equal(r.cost.originPriceNet, CARRO.originPrice);
  assert.equal(r.cost.vatDeposit, 0);
  assert.deepEqual(numeros(r), numerosDeal(esperado));
  assert.deepEqual(r.standCosts, ["vat"]);
});

test("o veredito usa o limiar do stand", () => {
  const margem = ANUNCIO.cost.grossMargin ?? 0;
  assert.ok(margem >= 500, "o fixture tem de ter margem para ser pelo menos marginal");
  const exigente = applyStandCosts(ANUNCIO, custos({ minMarginEur: margem + 1 }));
  assert.equal(exigente.verdict, "marginal");
  assert.deepEqual(exigente.standCosts, ["threshold"]);

  const pct = ANUNCIO.cost.grossMarginPct ?? 0;
  const porPct = applyStandCosts(ANUNCIO, custos({ minMarginEur: 0, minMarginPct: pct + 0.1 }));
  assert.equal(porPct.verdict, "marginal");

  const facil = applyStandCosts(ANUNCIO, custos({ minMarginEur: 100, minMarginPct: 0 }));
  assert.equal(facil.verdict, "compensa");
  // Limiar "compensa" abaixo do "marginal" de omissão: nunca fica "não compensa" acima dele.
  assert.deepEqual(numeros(facil), numeros(ANUNCIO));
});

test("anúncio publicado antes do motor novo: passa para a conta por margem", () => {
  const antigo = listingFrom(publicado, {
    cost: {
      originPrice: 23800,
      transport: 1100,
      isv: 2000,
      iuc: 150,
      legalization: 355,
      totalPt: 23800 + 1100 + 2000 + 150 + 355,
    },
    sourceVatRegime: undefined,
    verdict: "compensa",
  });
  const r = applyStandCosts(antigo, custos({ preparation: 500 }));
  assert.equal(r.cost.vatRegime, "margem");
  assert.equal(r.cost.legalization, 205, "legalização oficial por omissão, sem despachante");
  assert.equal(r.cost.despachante, 250);
  assert.equal(r.cost.preparation, 500);
  assert.equal(r.cost.totalPt, 23800 + 1100 + 2000 + 150 + 205 + 250 + 500);
  assert.ok(r.cost.grossMargin != null);
});

// ── Validação ───────────────────────────────────────────────────

const VALIDO = {
  transport: { DE: 1200, NL: 900 },
  legalization: 210,
  despachante: null,
  preparation: 450,
  minMarginEur: 2000,
  minMarginPct: 7.25,
  vatRegistered: true,
};

test("checkStandCosts aceita o formulário e arredonda a % a uma casa", () => {
  const r = checkStandCosts(VALIDO);
  assert.ok(r.ok);
  assert.deepEqual(r.value.transport, { DE: 1200, NL: 900 });
  assert.equal(r.value.despachante, null);
  assert.equal(r.value.minMarginPct, 7.3);
});

test("checkStandCosts recusa negativos, decimais em €, NaN, países e % fora", () => {
  const casos: unknown[] = [
    { ...VALIDO, preparation: -1 },
    { ...VALIDO, legalization: 205.5 },
    { ...VALIDO, despachante: Number.NaN },
    { ...VALIDO, preparation: 999_999 },
    { ...VALIDO, transport: { PT: 100 } },
    { ...VALIDO, transport: { DE: "800" } },
    { ...VALIDO, minMarginPct: 101 },
    { ...VALIDO, vatRegistered: "sim" },
    null,
    "x",
  ];
  for (const c of casos) {
    const r = checkStandCosts(c);
    assert.equal(r.ok, false, `devia recusar ${JSON.stringify(c)}`);
  }
});

// ── Gravar e ler (base descartável) ─────────────────────────────

const DB_URL = dbUrl();
const skip = skipUnlessLocalDb("o teste dos custos do stand");
const TEST_DB = "autoimport_stand_costs_test";
const STAND = "stand-com-custos";
const DONO = "user-dono";
const MEMBRO = "user-membro";

let sql: ReturnType<typeof postgres> | null = null;

before(async () => {
  if (skip) return;
  await recreateDatabases(DB_URL as string, TEST_DB);
  const url = withDbName(DB_URL as string, TEST_DB);
  migrate(url);
  process.env.WAREHOUSE_URL = url;
  sql = postgres(url, { prepare: false, onnotice: () => {} });

  await sql`insert into organization (id, name, slug, created_at)
            values (${STAND}, ${STAND}, ${STAND}, now())`;
  for (const [id, role] of [
    [DONO, "owner"],
    [MEMBRO, "member"],
  ]) {
    await sql`insert into "user" (id, name, email, created_at, updated_at)
              values (${id}, ${id}, ${`${id}@exemplo.pt`}, now(), now())`;
    await sql`insert into member (id, organization_id, user_id, role, created_at)
              values (${`m-${id}`}, ${STAND}, ${id}, ${role}, now())`;
  }
});

after(async () => {
  if (skip) return;
  await sql?.end();
  const { closeDb } = await import("../../db");
  await closeDb();
  await dropDatabases(DB_URL as string, TEST_DB);
});

test("stand sem linha: null (usa as médias)", { skip }, async () => {
  const { getStandCostsQuery } = await import("../../lib/stand-costs-queries");
  assert.equal(await getStandCostsQuery(STAND), null);
});

test("só o dono grava; um membro é recusado e nada muda", { skip }, async () => {
  const { getStandCostsQuery, saveStandCostsAsOwner } = await import(
    "../../lib/stand-costs-queries"
  );
  const recusado = await saveStandCostsAsOwner(STAND, MEMBRO, VALIDO);
  assert.equal(recusado.ok, false);
  assert.equal(await getStandCostsQuery(STAND), null);

  const deFora = await saveStandCostsAsOwner(STAND, "user-de-outro-stand", VALIDO);
  assert.equal(deFora.ok, false);

  const ok = await saveStandCostsAsOwner(STAND, DONO, VALIDO);
  assert.deepEqual(ok, { ok: true });
  const lido = await getStandCostsQuery(STAND);
  assert.deepEqual(lido, {
    transport: { DE: 1200, NL: 900 },
    legalization: 210,
    despachante: null,
    preparation: 450,
    minMarginEur: 2000,
    minMarginPct: 7.3,
    vatRegistered: true,
  });
});

test("gravar outra vez substitui (um stand, uma linha)", { skip }, async () => {
  const { getStandCostsQuery, saveStandCostsAsOwner } = await import(
    "../../lib/stand-costs-queries"
  );
  await saveStandCostsAsOwner(STAND, DONO, { ...EMPTY_STAND_COSTS, vatRegistered: false });
  const lido = await getStandCostsQuery(STAND);
  assert.deepEqual(lido, { ...EMPTY_STAND_COSTS, vatRegistered: false });
  const [{ n }] = await (sql as ReturnType<typeof postgres>)`
    select count(*)::int as n from stand_cost_settings where stand_id = ${STAND}`;
  assert.equal(n, 1);
});

test("valores inválidos não chegam à base", { skip }, async () => {
  const { getStandCostsQuery, saveStandCostsAsOwner } = await import(
    "../../lib/stand-costs-queries"
  );
  const antes = await getStandCostsQuery(STAND);
  const r = await saveStandCostsAsOwner(STAND, DONO, { ...VALIDO, preparation: -50 });
  assert.equal(r.ok, false);
  assert.deepEqual(await getStandCostsQuery(STAND), antes);
});
