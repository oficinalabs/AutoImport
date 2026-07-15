/**
 * Custos administrativos fixos de legalização (excl. ISV/IUC) — total
 * ~€300–400 (research/paises-viaveis-importacao-2026.md, achado 2).
 * Valores médios; afinar com faturas reais.
 */

export const LEGALIZATION_COSTS_EUR = {
  /** Inspeção técnica modelo 112 (importados) */
  inspecaoModelo112: 120,
  /** Homologação / averbamento IMT */
  imt: 45,
  /** DAV/DUA + registo + matrícula */
  duaRegisto: 165,
  /** Chapas de matrícula */
  chapas: 25,
} as const;

export const LEGALIZATION_TOTAL_EUR = Object.values(LEGALIZATION_COSTS_EUR).reduce(
  (a, b) => a + b,
  0,
);

export function estimateLegalization(): number {
  return LEGALIZATION_TOTAL_EUR;
}
