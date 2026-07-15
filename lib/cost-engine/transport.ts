/**
 * Transporte por camião porta-a-porta até Portugal — estimativas fixas por
 * país de origem. ASSUNÇÕES ajustáveis (médias de transportadoras ibéricas
 * consultadas no research de julho 2026); afinar com dados reais de compras.
 */
import type { CountryCode } from "../types";

export const TRANSPORT_COST_EUR: Record<CountryCode, number> = {
  DE: 1100,
  NL: 1000,
  BE: 950,
  FR: 800,
  ES: 450,
};

export function estimateTransport(country: CountryCode): number {
  return TRANSPORT_COST_EUR[country];
}
