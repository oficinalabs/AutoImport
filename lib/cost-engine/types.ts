/**
 * Tipos do cost engine — módulo PURO (sem DB/Next). As tabelas fiscais
 * entram sempre por argumento (vêm de `isv_tables` na BD, seed em
 * db/seed/isv-2026.ts); as funções nunca embutem valores de um ano.
 */
import type { CountryCode, FuelType } from "../types";

/** Escalão linear (ISV): valor = unidades × ratePerUnit − deduction. */
export interface LinearBracket {
  /** limite superior do escalão (inclusive); null = sem limite */
  upTo: number | null;
  ratePerUnit: number;
  deduction: number;
}

/** Escalão de montante fixo (IUC cilindrada / adicional gasóleo). */
export interface StepBracket {
  upTo: number | null;
  amount: number;
}

/** Escalão CO₂ do IUC: taxa + taxa adicional para matrículas ≥ 2017. */
export interface IucCo2Bracket {
  upTo: number | null;
  amount: number;
  /** somado quando a 1.ª matrícula (PT/UE/EEE) é ≥ 01/01/2017 */
  extra2017: number;
}

/** Redução por antiguidade (ISV art. 11.º, Tabela D). */
export interface AgeReductionBracket {
  /** idade mínima em anos (inclusive) */
  minYears: number;
  /** idade máxima em anos (exclusive); null = sem limite */
  maxYears: number | null;
  /** redução em percentagem, 0–100 */
  pct: number;
}

/** Taxas intermédias (ISV art. 8.º) — % do ISV normal + condições. */
export interface IntermediateRates {
  /** híbridos não plug-in: só com autonomia elétrica > minRangeKm E CO₂ < maxCo2 */
  hibrido: { pct: number; maxCo2: number; minRangeKm: number };
  /** PHEV: bateria de rede, autonomia ≥ minRangeKm, CO₂ < maxCo2 */
  phev: { pct: number; maxCo2: number; minRangeKm: number };
  /** PHEV usados matriculados na UE entre fromYear e toYear (sem limite CO₂) */
  phevUsado: { pct: number; minRangeKm: number; fromYear: number; toYear: number };
}

/** Coeficiente IUC por ano da 1.ª matrícula. */
export interface YearCoefBracket {
  fromYear: number | null;
  toYear: number | null;
  coef: number;
}

/** Conjunto completo das tabelas fiscais de um ano (payloads de isv_tables). */
export interface TaxTables {
  year: number;
  isvCilindrada: LinearBracket[];
  isvCo2GasolinaWltp: LinearBracket[];
  isvCo2DieselWltp: LinearBracket[];
  isvCo2GasolinaNedc: LinearBracket[];
  isvCo2DieselNedc: LinearBracket[];
  isvReducaoAntiguidade: AgeReductionBracket[];
  isvTaxasIntermedias: IntermediateRates;
  /** agravamento partículas gasóleo (art. 9.º) — €, isento se partículas < 0,001 g/km */
  isvAgravamentoDiesel: number;
  iucCilindrada: StepBracket[];
  iucCo2Wltp: IucCo2Bracket[];
  iucCo2Nedc: IucCo2Bracket[];
  iucCoefAno: YearCoefBracket[];
  iucAdicionalDiesel: StepBracket[];
}

/** Inputs de um cálculo de custo de importação. */
export interface CostInput {
  /** preço pedido no país de origem, EUR */
  originPrice: number;
  fuel: FuelType;
  /** cilindrada em cm³ (dispensável em elétricos) */
  displacementCc?: number;
  /** CO₂ g/km (dispensável em elétricos) */
  co2?: number;
  /** data da primeira matrícula (origem) */
  firstRegistration: Date;
  country: CountryCode;
  /** data de referência do cálculo (idade do veículo); default: agora */
  referenceDate?: Date;
}

/** Resultado detalhado do ISV — auditável (vai para inputs jsonb). */
export interface IsvBreakdown {
  cilindrada: number;
  ambiental: number;
  agravamentoDiesel: number;
  /** % da taxa intermédia aplicada (100 = taxa normal) */
  taxaPct: number;
  /** % de redução por antiguidade aplicada */
  reducaoPct: number;
  /** norma da tabela CO₂ usada */
  norm: "wltp" | "nedc" | "n/a";
  total: number;
  /** assunções tomadas por falta de dados (ex.: "phev sem autonomia — assumido elegível") */
  assumptions: string[];
}
