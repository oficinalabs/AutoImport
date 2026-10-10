/**
 * Cost engine — custo total de importar e legalizar um carro em PT.
 * Puro: as tabelas fiscais entram por argumento (ver db/seed/isv-2026.ts).
 */
import type { CostBreakdown } from "../types";
import { calculateIsv } from "./isv";
import { calculateIuc } from "./iuc";
import { DESPACHANTE_DEFAULT_EUR, estimateLegalization } from "./legalization";
import { PREPARATION_DEFAULT_EUR, grossMargin } from "./margin";
import { isNewMeansOfTransport } from "./new-vehicle";
import { estimateTransport } from "./transport";
import type {
  CostInput,
  DealInput,
  DealOptions,
  DealResult,
  IsvBreakdown,
  TaxTables,
  VatRegime,
} from "./types";
import { applicableRegime, originPriceNet, vatDeposit } from "./vat";

export type {
  CostInput,
  DealInput,
  DealOptions,
  DealResult,
  IsvBreakdown,
  SourceVatRegime,
  TaxTables,
  VatRegime,
} from "./types";
export { calculateIsv, co2Norm, vehicleAgeYears } from "./isv";
export { calculateIuc } from "./iuc";
export {
  estimateTransport,
  ES_TRANSPORT_BY_PROVINCE_EUR,
  FR_TRANSPORT_BY_DEPARTMENT_EUR,
  TRANSPORT_COST_EUR,
} from "./transport";
export {
  DESPACHANTE_DEFAULT_EUR,
  estimateLegalization,
  LEGALIZATION_IMT_SEM_COC_EUR,
  LEGALIZATION_OFFICIAL_EUR,
} from "./legalization";
export { grossMargin, outputVat, PREPARATION_DEFAULT_EUR } from "./margin";
export { isNewMeansOfTransport, NEW_VEHICLE_MAX_KM, NEW_VEHICLE_MAX_MONTHS } from "./new-vehicle";
export { applicableRegime, originPriceNet, VAT_RATE_ORIGIN, VAT_RATE_PT, vatDeposit } from "./vat";
export {
  ES_EXCLUDED_POSTAL_PREFIXES,
  ES_EXCLUDED_REGION_REGEX_SOURCE,
  ES_ISLAND_POSTAL_PREFIXES,
  ES_ISLAND_REGION_REGEX_SOURCE,
  FR_EXCLUDED_POSTAL_PREFIXES,
  FR_EXCLUDED_REGION_REGEX_SOURCE,
  isExcludedTerritory,
} from "./territory";

export interface CostResult {
  breakdown: CostBreakdown;
  /** detalhe auditável do ISV (componentes, taxa, redução, assunções) */
  isvDetail: IsvBreakdown;
}

/**
 * Conta antiga (preço anunciado = custo, sem IVA de saída), mantida enquanto o
 * pipeline não passa para `computeDeal` (P06). O `legalization` daqui junta o
 * custo oficial e o despachante, porque o `CostBreakdown` antigo não tem campo
 * para o despachante.
 */
export function computeCostBreakdown(input: CostInput, tables: TaxTables): CostResult {
  const isvDetail = calculateIsv(input, tables);
  const iuc = calculateIuc(input, tables);
  const transport = estimateTransport(input.country);
  const legalization = estimateLegalization() + DESPACHANTE_DEFAULT_EUR;

  const isv = Math.round(isvDetail.total);
  const iucRounded = Math.round(iuc);
  const totalPt = input.originPrice + transport + isv + iucRounded + legalization;

  return {
    breakdown: {
      originPrice: input.originPrice,
      transport,
      isv,
      iuc: iucRounded,
      legalization,
      totalPt,
    },
    isvDetail,
  };
}

/**
 * Conta completa de um negócio para um stand: regime de IVA, custo efetivo,
 * caução, IVA de saída ao `ptPrice` (PVP com IVA) e margem bruta. Valores em
 * euros inteiros. Os custos que `options` não traz usam os defaults (plano §5).
 *
 * Um "meio de transporte novo" paga sempre IVA PT e não pode ir para a margem:
 * o custo de compra segue o regime do anúncio, mas a revenda é em regime normal.
 */
export function computeDeal(input: DealInput, ptPrice: number, options: DealOptions): DealResult {
  const { tables, standVatRegistered = true } = options;
  const isvDetail = calculateIsv(input, tables);
  const isv = Math.round(isvDetail.total);
  const iuc = Math.round(calculateIuc(input, tables));
  const transport =
    options.transport ?? estimateTransport(input.country, input.postalCode, input.originPrice);
  const legalization = options.legalization ?? estimateLegalization({ coc: options.coc });
  const despachante = options.despachante ?? DESPACHANTE_DEFAULT_EUR;
  const preparation = options.preparation ?? PREPARATION_DEFAULT_EUR;

  const purchaseRegime = applicableRegime(
    input.sourceVatRegime,
    input.country,
    standVatRegistered,
    input.priceNet,
  );
  const newMeansOfTransport = isNewMeansOfTransport(
    input.km,
    input.firstRegistration,
    input.referenceDate,
  );
  const vatRegime: VatRegime = newMeansOfTransport ? "dedutivel" : purchaseRegime;
  const net = originPriceNet(input.originPrice, input.country, purchaseRegime, input.priceNet);

  const totalPt = net + transport + isv + iuc + legalization + despachante + preparation;
  const margin = grossMargin(vatRegime, ptPrice, input.originPrice, totalPt);

  return {
    originPrice: input.originPrice,
    transport,
    isv,
    iuc,
    legalization,
    despachante,
    preparation,
    totalPt,
    vatRegime,
    originPriceNet: net,
    vatDeposit: vatDeposit(input.originPrice, net),
    outputVat: Math.round(margin.outputVat),
    grossMargin: Math.round(margin.grossMargin),
    grossMarginPct: margin.grossMarginPct,
    newMeansOfTransport,
    isvDetail,
  };
}
