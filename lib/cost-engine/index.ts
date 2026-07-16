/**
 * Cost engine — custo total de importar e legalizar um carro em PT.
 * Puro: as tabelas fiscais entram por argumento (ver db/seed/isv-2026.ts).
 */
import type { CostBreakdown } from "../types";
import { calculateIsv } from "./isv";
import { calculateIuc } from "./iuc";
import { estimateLegalization } from "./legalization";
import { estimateTransport } from "./transport";
import type { CostInput, IsvBreakdown, TaxTables } from "./types";

export type { CostInput, IsvBreakdown, TaxTables } from "./types";
export { calculateIsv, co2Norm, vehicleAgeYears } from "./isv";
export { calculateIuc } from "./iuc";
export { estimateTransport, TRANSPORT_COST_EUR } from "./transport";
export { estimateLegalization, LEGALIZATION_COSTS_EUR } from "./legalization";

export interface CostResult {
  breakdown: CostBreakdown;
  /** detalhe auditável do ISV (componentes, taxa, redução, assunções) */
  isvDetail: IsvBreakdown;
}

export function computeCostBreakdown(input: CostInput, tables: TaxTables): CostResult {
  const isvDetail = calculateIsv(input, tables);
  const iuc = calculateIuc(input, tables);
  const transport = estimateTransport(input.country);
  const legalization = estimateLegalization();

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
