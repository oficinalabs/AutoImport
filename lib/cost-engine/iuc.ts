/**
 * IUC — Imposto Único de Circulação, categoria B (ligeiros de passageiros
 * com 1.ª matrícula ≥ jul/2007), valor anual (1.º ano após legalização):
 *   IUC = (taxa cilindrada + taxa CO₂ [+ adicional CO₂ se matrícula ≥ 2017])
 *         × coeficiente do ano + adicional gasóleo
 * Elétricos: isentos. O coeficiente e o adicional 2017 usam o ano da
 * 1.ª matrícula de ORIGEM (UE/EEE), não a data da matrícula PT.
 *
 * A partir de 2027 (DL 161/2026, de 4 de agosto, efeitos a 1/1/2027) o período
 * de tributação é o ano civil e, no ano da matrícula PT, há isenção proporcional
 * aos meses completos decorridos desde 1 de janeiro (CIUC art. 4.º n.º 2 e
 * art. 5.º n.º 10). O valor devolvido é o do 1.º ano: para matrículas PT em
 * 2027 ou depois, só a parte proporcional.
 * Fonte: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/decreto-lei-161-2026.pdf
 * (lido a 10/10/2026).
 */
import type { CostInput, StepBracket, TaxTables } from "./types";

/** 1.º ano em que o IUC do ano da matrícula é proporcional (DL 161/2026). */
export const IUC_PROPORCIONAL_DESDE = 2027;

/**
 * DEFAULT: sem data prevista, a matrícula PT conta-se para o mês seguinte ao da
 * referência (chegada + inspeção + DAV + IMT cabem, no caso típico, num mês).
 */
export const MESES_ATE_MATRICULA_PT = 1;

/** Data prevista da matrícula PT: dia 1 do mês `referenceDate` + MESES_ATE_MATRICULA_PT. */
export function expectedPtRegistration(referenceDate: Date): Date {
  return new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth() + MESES_ATE_MATRICULA_PT,
      1,
    ),
  );
}

/**
 * Fração do IUC anual devida no ano da matrícula PT: 1 até 2026; a partir de
 * 2027, (12 − meses completos desde 1 de janeiro) / 12. Matrícula a 15 de março
 * → 2 meses completos (jan, fev) → 10/12.
 */
export function iucFirstYearFraction(ptRegistration: Date): number {
  if (ptRegistration.getUTCFullYear() < IUC_PROPORCIONAL_DESDE) return 1;
  return (12 - ptRegistration.getUTCMonth()) / 12;
}

/** Montante do escalão em que `units` cai. */
function stepValue(units: number, brackets: StepBracket[]): number {
  const bracket =
    brackets.find((b) => b.upTo !== null && units <= b.upTo) ?? brackets[brackets.length - 1];
  return bracket.amount;
}

/**
 * IUC do 1.º ano em PT. `ptRegistration` é a data prevista da matrícula PT
 * (default: expectedPtRegistration(referenceDate ?? hoje)).
 */
export function calculateIuc(
  input: CostInput,
  tables: TaxTables,
  options: { ptRegistration?: Date } = {},
): number {
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

  const annual = (cilindrada + co2) * coef + adicionalDiesel;
  const ptRegistration =
    options.ptRegistration ?? expectedPtRegistration(input.referenceDate ?? new Date());
  return Math.round(annual * iucFirstYearFraction(ptRegistration) * 100) / 100;
}
