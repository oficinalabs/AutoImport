/**
 * IUC — Imposto Único de Circulação, categoria B (ligeiros de passageiros
 * com 1.ª matrícula ≥ jul/2007), valor anual (1.º ano após legalização):
 *   IUC = (taxa cilindrada + taxa CO₂ [+ adicional CO₂ se matrícula ≥ 2017])
 *         × coeficiente do ano + adicional gasóleo
 * Elétricos: isentos. O coeficiente e o adicional 2017 usam o ano da
 * 1.ª matrícula de ORIGEM (UE/EEE), não a data da matrícula PT.
 */
import type { CostInput, StepBracket, TaxTables } from "./types";

/** Montante do escalão em que `units` cai. */
function stepValue(units: number, brackets: StepBracket[]): number {
  const bracket =
    brackets.find((b) => b.upTo !== null && units <= b.upTo) ?? brackets[brackets.length - 1];
  return bracket.amount;
}

export function calculateIuc(input: CostInput, tables: TaxTables): number {
  if (input.fuel === "elétrico") return 0;

  if (input.displacementCc == null || input.co2 == null) {
    throw new Error("IUC: displacementCc e co2 são obrigatórios para não-elétricos");
  }

  const co2Value = input.co2;
  const year = input.firstRegistration.getFullYear();

  const cilindrada = stepValue(input.displacementCc, tables.iucCilindrada);

  // Escalões CO₂ por norma (mesma assunção do ISV: ≥2019 WLTP, ≤2018 NEDC)
  const co2Table = year >= 2019 ? tables.iucCo2Wltp : tables.iucCo2Nedc;
  const co2Bracket =
    co2Table.find((b) => b.upTo !== null && co2Value <= b.upTo) ?? co2Table[co2Table.length - 1];
  const co2 = co2Bracket.amount + (year >= 2017 ? co2Bracket.extra2017 : 0);

  const coefBracket = tables.iucCoefAno.find(
    (b) => (b.fromYear === null || year >= b.fromYear) && (b.toYear === null || year <= b.toYear),
  );
  const coef = coefBracket?.coef ?? 1;

  const adicionalDiesel =
    input.fuel === "diesel" ? stepValue(input.displacementCc, tables.iucAdicionalDiesel) : 0;

  return Math.round(((cilindrada + co2) * coef + adicionalDiesel) * 100) / 100;
}
