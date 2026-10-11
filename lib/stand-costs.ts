/**
 * Custos próprios do stand (P09): recalcula a conta de um anúncio publicado com
 * o transporte, a legalização, o despachante, a preparação, o limiar de margem e
 * o VIES que o stand definiu. Módulo PURO — sem BD nem Next.
 *
 * Porque não chama o `computeDeal` inteiro: o `computeDeal` precisa das tabelas
 * fiscais e dos dados do motor (cilindrada, CO₂, 1.ª matrícula) para refazer o
 * ISV e o IUC, e nada do que o stand define mexe nesses dois impostos. Por isso
 * o ISV e o IUC vêm da conta publicada, e o resto passa pelas MESMAS funções que
 * o `computeDeal` usa (`applicableRegime`, `originPriceNet`, `grossMargin`,
 * `vatDeposit`) — a conta é a mesma, sem uma query às tabelas por anúncio.
 *
 * O recálculo é à LEITURA e não republica a montra: a ordenação e os filtros da
 * pesquisa continuam pela margem publicada (a pesquisa di-lo em texto pequeno).
 */
import {
  DESPACHANTE_DEFAULT_EUR,
  PREPARATION_DEFAULT_EUR,
  applicableRegime,
  estimateLegalization,
  grossMargin,
  originPriceNet,
  vatDeposit,
} from "./cost-engine";
import type { CostBreakdown, CountryCode, Listing, VatRegime } from "./types";
import { DEFAULT_MARGIN_THRESHOLDS, type MarginThresholds, verdictFromMargin } from "./verdict";

/** O que o stand definiu (`stand_cost_settings`); `null`/ausente = usa a média. */
export interface StandCostSettings {
  /** transporte por país de origem, só os que o stand definiu */
  transport: Partial<Record<CountryCode, number>>;
  legalization: number | null;
  despachante: number | null;
  preparation: number | null;
  /** limiar "compensa" do stand, em € de margem bruta */
  minMarginEur: number | null;
  /** limiar "compensa" do stand, em % do preço PT */
  minMarginPct: number | null;
  /** tem n.º de IVA válido no VIES; sem ele nada é dedutível */
  vatRegistered: boolean;
}

/** Que parcelas da conta vieram do stand (o resto são as médias publicadas). */
export type StandCostField =
  | "transport"
  | "legalization"
  | "despachante"
  | "preparation"
  | "threshold"
  | "vat";

/** Um anúncio com a conta do stand: `standCosts` diz que valores são do stand. */
export type ListingWithStandCosts = Listing & { standCosts?: StandCostField[] };

/** Um stand sem nada definido: é o que um stand sem linha na tabela tem. */
export const EMPTY_STAND_COSTS: StandCostSettings = {
  transport: {},
  legalization: null,
  despachante: null,
  preparation: null,
  minMarginEur: null,
  minMarginPct: null,
  vatRegistered: true,
};

/** true se o stand não mudou nada — então vê exatamente os números publicados. */
export function isEmptyStandCosts(s: StandCostSettings | null | undefined): boolean {
  if (!s) return true;
  return (
    Object.keys(s.transport).length === 0 &&
    s.legalization == null &&
    s.despachante == null &&
    s.preparation == null &&
    s.minMarginEur == null &&
    s.minMarginPct == null &&
    s.vatRegistered
  );
}

/** Limiares do veredito do stand; o "marginal" nunca fica acima do "compensa". */
export function standThresholds(s: StandCostSettings): MarginThresholds {
  const compensaEur = s.minMarginEur ?? DEFAULT_MARGIN_THRESHOLDS.compensaEur;
  return {
    compensaEur,
    compensaPct: s.minMarginPct ?? DEFAULT_MARGIN_THRESHOLDS.compensaPct,
    marginalEur: Math.min(DEFAULT_MARGIN_THRESHOLDS.marginalEur, compensaEur),
  };
}

/**
 * A conta do anúncio com os custos do stand. Sem definições devolve o MESMO
 * objeto (números publicados, ao cêntimo).
 *
 * Anúncios publicados antes do motor novo (sem `grossMargin`) passam também para
 * a conta por margem: o stand pediu a sua conta, e a poupança antiga não tem
 * onde pôr despachante, preparação nem IVA. As parcelas que faltam usam os
 * defaults do motor (plano §5).
 */
export function applyStandCosts(
  listing: Listing,
  settings: StandCostSettings | null | undefined,
): ListingWithStandCosts {
  if (!settings || isEmptyStandCosts(settings)) return listing;

  const c = listing.cost;
  const fromStand: StandCostField[] = [];
  const pick = (field: StandCostField, own: number | null | undefined, fallback: number) => {
    if (own == null) return fallback;
    fromStand.push(field);
    return own;
  };

  const publishedNew = c.grossMargin != null;
  const transport = pick("transport", settings.transport[listing.country], c.transport);
  const legalization = pick(
    "legalization",
    settings.legalization,
    publishedNew ? c.legalization : estimateLegalization(),
  );
  const despachante = pick(
    "despachante",
    settings.despachante,
    c.despachante ?? DESPACHANTE_DEFAULT_EUR,
  );
  const preparation = pick(
    "preparation",
    settings.preparation,
    c.preparation ?? PREPARATION_DEFAULT_EUR,
  );
  if (settings.minMarginEur != null || settings.minMarginPct != null) fromStand.push("threshold");
  if (!settings.vatRegistered) fromStand.push("vat");

  // Regime de compra. A montra foi calculada para um stand COM VIES (P06): com
  // VIES, o regime publicado mantém-se (o `price_net` que o decidiu não chega à
  // app); sem VIES, nada é dedutível.
  const published: VatRegime | undefined = c.vatRegime;
  const purchaseRegime: VatRegime = !settings.vatRegistered
    ? "margem"
    : (published ?? applicableRegime(listing.sourceVatRegime, listing.country, true, undefined));
  const net =
    purchaseRegime === published && c.originPriceNet != null
      ? c.originPriceNet
      : originPriceNet(c.originPrice, listing.country, purchaseRegime);

  const ptPrice = listing.ptMarket.estimatedPrice;
  const totalPt = net + transport + c.isv + c.iuc + legalization + despachante + preparation;
  const m = grossMargin(purchaseRegime, ptPrice, c.originPrice, totalPt);
  const margin = Math.round(m.grossMargin);

  const cost: CostBreakdown = {
    ...c,
    transport,
    legalization,
    despachante,
    preparation,
    totalPt,
    vatRegime: purchaseRegime,
    originPriceNet: net,
    vatDeposit: vatDeposit(c.originPrice, net),
    outputVat: Math.round(m.outputVat),
    grossMargin: margin,
    grossMarginPct: m.grossMarginPct,
  };
  const savings = ptPrice - totalPt;
  return {
    ...listing,
    cost,
    savings,
    savingsPct: ptPrice > 0 ? Math.round((savings / ptPrice) * 1000) / 10 : 0,
    verdict: verdictFromMargin(margin, m.grossMarginPct, standThresholds(settings)),
    standCosts: fromStand,
  };
}

// ── Validação do formulário ─────────────────────────────────────

/** Teto de cada valor em €: acima disto é um zero a mais, não um custo. */
export const STAND_COST_MAX_EUR = 20_000;
/** Teto do limiar de margem em € (um carro de 200 000 € a 15 %). */
export const STAND_MIN_MARGIN_MAX_EUR = 30_000;

const COUNTRY_CODES: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];

const euros = (v: unknown, max: number): number | null | false => {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) return false;
  return v;
};

/**
 * Valida o que o formulário manda. Corre no servidor (o cliente não é de
 * confiança): só inteiros ≥ 0 em euros, percentagem entre 0 e 100, e só os
 * cinco países de origem. `null` = "usa a média".
 */
export function checkStandCosts(
  input: unknown,
): { ok: true; value: StandCostSettings } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Dados inválidos." };
  const i = input as Record<string, unknown>;

  const transport: Partial<Record<CountryCode, number>> = {};
  const t = i.transport;
  if (t != null && typeof t !== "object") return { ok: false, error: "Transporte inválido." };
  for (const [code, value] of Object.entries((t ?? {}) as Record<string, unknown>)) {
    if (!COUNTRY_CODES.includes(code as CountryCode)) {
      return { ok: false, error: "País de origem desconhecido." };
    }
    const v = euros(value, STAND_COST_MAX_EUR);
    if (v === false) {
      return {
        ok: false,
        error: `O transporte tem de ser um valor entre 0 e ${STAND_COST_MAX_EUR} €.`,
      };
    }
    if (v != null) transport[code as CountryCode] = v;
  }

  const fields = [
    ["legalization", "A legalização", STAND_COST_MAX_EUR],
    ["despachante", "O despachante", STAND_COST_MAX_EUR],
    ["preparation", "A preparação", STAND_COST_MAX_EUR],
    ["minMarginEur", "A margem mínima", STAND_MIN_MARGIN_MAX_EUR],
  ] as const;
  const out: Record<string, number | null> = {};
  for (const [key, label, max] of fields) {
    const v = euros(i[key], max);
    if (v === false)
      return { ok: false, error: `${label} tem de ser um valor entre 0 e ${max} €.` };
    out[key] = v;
  }

  const pct = i.minMarginPct;
  if (pct != null && (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100)) {
    return { ok: false, error: "A margem mínima em % tem de estar entre 0 e 100." };
  }
  if (typeof i.vatRegistered !== "boolean") return { ok: false, error: "Dados inválidos." };

  return {
    ok: true,
    value: {
      transport,
      legalization: out.legalization,
      despachante: out.despachante,
      preparation: out.preparation,
      minMarginEur: out.minMarginEur,
      minMarginPct: pct == null ? null : Math.round((pct as number) * 10) / 10,
      vatRegistered: i.vatRegistered,
    },
  };
}
