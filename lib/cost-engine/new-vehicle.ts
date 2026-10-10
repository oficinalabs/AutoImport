/**
 * "Meio de transporte novo" (RITI art. 6.º n.º 2 b); Diretiva 2006/112/CE
 * art. 2.º n.º 2 b) — https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32006L0112):
 * um carro é novo se tiver ≤ 6 000 km **ou** ≤ 6 meses desde a 1.ª matrícula.
 * Basta uma das condições. Paga sempre IVA PT e não pode ir para a margem
 * (estudo PT §3.1; DE, FR, ES, NL §3.5). Os "km 0" espanhóis caem quase todos aqui.
 */

export const NEW_VEHICLE_MAX_KM = 6000;
export const NEW_VEHICLE_MAX_MONTHS = 6;

/**
 * Sem km e sem data não se afirma nada → `false` (não excluir por falta de
 * dados, como o `isExcludedTerritory`).
 */
export function isNewMeansOfTransport(
  km: number | null | undefined,
  firstRegistration: Date | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  if (km != null && km <= NEW_VEHICLE_MAX_KM) return true;
  if (!firstRegistration) return false;
  const limit = new Date(firstRegistration);
  limit.setUTCMonth(limit.getUTCMonth() + NEW_VEHICLE_MAX_MONTHS);
  return referenceDate <= limit;
}
