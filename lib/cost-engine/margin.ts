/**
 * Revenda em PT: IVA de saída e margem bruta do stand.
 * Regras e exemplo numérico no estudo PT §3.2–3.3 (DL 199/96; AT, informação
 * vinculativa 14457 — o ISV não entra no preço de compra da margem).
 */
import type { VatRegime } from "./types";
import { VAT_RATE_PT } from "./vat";

/** Preparação/garantia por carro — DEFAULT (plano §5); o stand afina no P09. */
export const PREPARATION_DEFAULT_EUR = 300;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * IVA a liquidar ao vender por `ptPrice` (PVP com IVA).
 *  - normal (comprou com IVA dedutível): PVP × 23/123, ISV incluído na base;
 *  - margem: max(0, PVP − preço de compra) × 23/123.
 */
export function outputVat(regime: VatRegime, ptPrice: number, purchasePrice: number): number {
  const rate = VAT_RATE_PT / (1 + VAT_RATE_PT);
  const base = regime === "dedutivel" ? ptPrice : Math.max(0, ptPrice - purchasePrice);
  return round2(base * rate);
}

/**
 * Margem bruta = PVP − IVA de saída − custo total. `purchasePrice` é o preço
 * anunciado (base da margem); `totalCost` já tem o custo de compra efetivo.
 */
export function grossMargin(
  regime: VatRegime,
  ptPrice: number,
  purchasePrice: number,
  totalCost: number,
): { outputVat: number; grossMargin: number; grossMarginPct: number } {
  const vat = outputVat(regime, ptPrice, purchasePrice);
  const margin = round2(ptPrice - vat - totalCost);
  const pct = ptPrice > 0 ? Math.round((margin / ptPrice) * 1000) / 10 : 0;
  return { outputVat: vat, grossMargin: margin, grossMarginPct: pct };
}
