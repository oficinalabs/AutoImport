/**
 * Tabelas fiscais 2026 (= 2025; o OE 2026 / Lei 73-A/2025 não alterou taxas —
 * a única mudança substantiva é a condição PHEV Euro 6e-bis, art. 8.º d)).
 * Valores cross-verificados contra o folheto oficial da AT (SFP-Taxas-2025)
 * e a lei consolidada no DR — ver research (agente jul/2026) e sourceUrl por bloco.
 *
 * A forma de cada payload está em lib/cost-engine/types.ts (TaxTables).
 * Versionamento: quando o OE 2027 mudar taxas, acrescentar linhas year=2027.
 */
import type {
  AgeReductionBracket,
  IntermediateRates,
  IucCo2Bracket,
  LinearBracket,
  StepBracket,
  TaxTables,
  YearCoefBracket,
} from "../../lib/cost-engine/types";

const AT_FOLHETO =
  "https://info.portaldasfinancas.gov.pt/pt/apoio_contribuinte/Folhetos_informativos/Documents/SFP-Taxas-2025.pdf";
const ISV_2026 = "https://impostosobreveiculos.info/isv/imposto-sobre-veiculos-isv-2026/";
const IUC_2026 = "https://impostosobreveiculos.info/iuc/imposto-unico-circulacao-iuc-2026/";
const ART8 =
  "https://informador.pt/legislacao/lexit/codigos/direito-fiscal/codigo-do-isv/capitulo-i-principios-e-regras-gerais-3/artigo-8-o-taxas-intermedias-automoveis/";

/** ISV Tabela A — componente cilindrada (gasolina e gasóleo). */
const isvCilindrada: LinearBracket[] = [
  { upTo: 1000, ratePerUnit: 1.09, deduction: 849.03 },
  { upTo: 1250, ratePerUnit: 1.18, deduction: 850.69 },
  { upTo: null, ratePerUnit: 5.61, deduction: 6194.88 },
];

/** ISV componente ambiental — gasolina, WLTP (g/km). */
const isvCo2GasolinaWltp: LinearBracket[] = [
  { upTo: 110, ratePerUnit: 0.44, deduction: 43.02 },
  { upTo: 115, ratePerUnit: 1.1, deduction: 115.8 },
  { upTo: 120, ratePerUnit: 1.38, deduction: 147.79 },
  { upTo: 130, ratePerUnit: 5.27, deduction: 619.17 },
  { upTo: 145, ratePerUnit: 6.38, deduction: 762.73 },
  { upTo: 175, ratePerUnit: 41.54, deduction: 5819.56 },
  { upTo: 195, ratePerUnit: 51.38, deduction: 7247.39 },
  { upTo: 235, ratePerUnit: 193.01, deduction: 34190.52 },
  { upTo: null, ratePerUnit: 233.81, deduction: 41910.96 },
];

/** ISV componente ambiental — gasóleo, WLTP (g/km). */
const isvCo2DieselWltp: LinearBracket[] = [
  { upTo: 110, ratePerUnit: 1.72, deduction: 11.5 },
  { upTo: 120, ratePerUnit: 18.96, deduction: 1906.19 },
  { upTo: 140, ratePerUnit: 65.04, deduction: 7360.85 },
  { upTo: 150, ratePerUnit: 127.4, deduction: 16080.57 },
  { upTo: 160, ratePerUnit: 160.81, deduction: 21176.06 },
  { upTo: 170, ratePerUnit: 221.69, deduction: 29227.38 },
  { upTo: 190, ratePerUnit: 274.08, deduction: 36987.98 },
  { upTo: null, ratePerUnit: 282.35, deduction: 38271.32 },
];

/** ISV componente ambiental — gasolina, NEDC (homologações pré-WLTP). */
const isvCo2GasolinaNedc: LinearBracket[] = [
  { upTo: 99, ratePerUnit: 4.62, deduction: 427.0 },
  { upTo: 115, ratePerUnit: 8.09, deduction: 750.99 },
  { upTo: 145, ratePerUnit: 52.56, deduction: 5903.94 },
  { upTo: 175, ratePerUnit: 61.24, deduction: 7140.17 },
  { upTo: 195, ratePerUnit: 155.97, deduction: 23627.27 },
  { upTo: null, ratePerUnit: 205.65, deduction: 33390.12 },
];

/** ISV componente ambiental — gasóleo, NEDC. */
const isvCo2DieselNedc: LinearBracket[] = [
  { upTo: 79, ratePerUnit: 5.78, deduction: 439.04 },
  { upTo: 95, ratePerUnit: 23.45, deduction: 1848.58 },
  { upTo: 120, ratePerUnit: 79.22, deduction: 7195.63 },
  { upTo: 140, ratePerUnit: 175.73, deduction: 18924.92 },
  { upTo: 160, ratePerUnit: 195.43, deduction: 21720.92 },
  { upTo: null, ratePerUnit: 268.42, deduction: 33447.9 },
];

/** ISV art. 11.º Tabela D — redução por antiguidade (usados UE), Lei 45-A/2024. */
const isvReducaoAntiguidade: AgeReductionBracket[] = [
  { minYears: 0, maxYears: 1, pct: 10 },
  { minYears: 1, maxYears: 2, pct: 20 },
  { minYears: 2, maxYears: 3, pct: 28 },
  { minYears: 3, maxYears: 4, pct: 35 },
  { minYears: 4, maxYears: 5, pct: 43 },
  { minYears: 5, maxYears: 6, pct: 52 },
  { minYears: 6, maxYears: 7, pct: 60 },
  { minYears: 7, maxYears: 8, pct: 65 },
  { minYears: 8, maxYears: 9, pct: 70 },
  { minYears: 9, maxYears: 10, pct: 75 },
  { minYears: 10, maxYears: null, pct: 80 },
];

/**
 * ISV art. 8.º — taxas intermédias (texto em vigor 01/01/2026).
 * Nota: a condição atual dos híbridos (>50 km elétricos E <50 g) exclui na
 * prática os HEV convencionais (pagam 100%). GPL não tem taxa intermédia
 * desde o OE 2021. A alínea d) alargou CO₂ < 80 g para Euro 6e-bis (norma
 * que não conseguimos verificar por anúncio — não modelada; fica <50 g).
 */
const isvTaxasIntermedias: IntermediateRates = {
  hibrido: { pct: 60, maxCo2: 50, minRangeKm: 50 },
  phev: { pct: 25, maxCo2: 50, minRangeKm: 50 },
  phevUsado: { pct: 25, minRangeKm: 25, fromYear: 2015, toYear: 2020 },
};

/** ISV art. 9.º — agravamento partículas gasóleo (isento se < 0,001 g/km). */
const isvAgravamentoDiesel = 500;

/** IUC categoria B — componente cilindrada. */
const iucCilindrada: StepBracket[] = [
  { upTo: 1250, amount: 31.77 },
  { upTo: 1750, amount: 63.74 },
  { upTo: 2500, amount: 127.35 },
  { upTo: null, amount: 435.84 },
];

/** IUC categoria B — componente CO₂ WLTP (extra2017: adicional matrícula ≥ 2017). */
const iucCo2Wltp: IucCo2Bracket[] = [
  { upTo: 140, amount: 65.15, extra2017: 0 },
  { upTo: 205, amount: 97.63, extra2017: 0 },
  { upTo: 260, amount: 212.04, extra2017: 31.77 },
  { upTo: null, amount: 363.25, extra2017: 63.74 },
];

/** IUC categoria B — componente CO₂ NEDC. */
const iucCo2Nedc: IucCo2Bracket[] = [
  { upTo: 120, amount: 65.15, extra2017: 0 },
  { upTo: 180, amount: 97.63, extra2017: 0 },
  { upTo: 250, amount: 212.04, extra2017: 31.77 },
  { upTo: null, amount: 363.25, extra2017: 63.74 },
];

/** IUC — coeficiente por ano da 1.ª matrícula (PT/UE/EEE). */
const iucCoefAno: YearCoefBracket[] = [
  { fromYear: null, toYear: 2007, coef: 1.0 },
  { fromYear: 2008, toYear: 2008, coef: 1.05 },
  { fromYear: 2009, toYear: 2009, coef: 1.1 },
  { fromYear: 2010, toYear: null, coef: 1.15 },
];

/** IUC — adicional gasóleo (categoria B), somado APÓS o coeficiente. */
const iucAdicionalDiesel: StepBracket[] = [
  { upTo: 1250, amount: 5.02 },
  { upTo: 1750, amount: 10.07 },
  { upTo: 2500, amount: 20.12 },
  { upTo: null, amount: 68.85 },
];

/** As tabelas completas de 2026 na forma que o cost engine consome. */
export const TAX_TABLES_2026: TaxTables = {
  year: 2026,
  isvCilindrada,
  isvCo2GasolinaWltp,
  isvCo2DieselWltp,
  isvCo2GasolinaNedc,
  isvCo2DieselNedc,
  isvReducaoAntiguidade,
  isvTaxasIntermedias,
  isvAgravamentoDiesel,
  iucCilindrada,
  iucCo2Wltp,
  iucCo2Nedc,
  iucCoefAno,
  iucAdicionalDiesel,
};

/** Linhas para a tabela `isv_tables` (unique em year+kind). */
export const ISV_TABLES_2026: {
  year: number;
  kind: string;
  payload: unknown;
  sourceUrl: string;
}[] = [
  { year: 2026, kind: "isv_cilindrada", payload: isvCilindrada, sourceUrl: AT_FOLHETO },
  { year: 2026, kind: "isv_co2_gasolina_wltp", payload: isvCo2GasolinaWltp, sourceUrl: AT_FOLHETO },
  { year: 2026, kind: "isv_co2_diesel_wltp", payload: isvCo2DieselWltp, sourceUrl: AT_FOLHETO },
  { year: 2026, kind: "isv_co2_gasolina_nedc", payload: isvCo2GasolinaNedc, sourceUrl: AT_FOLHETO },
  { year: 2026, kind: "isv_co2_diesel_nedc", payload: isvCo2DieselNedc, sourceUrl: AT_FOLHETO },
  {
    year: 2026,
    kind: "isv_reducao_antiguidade",
    payload: isvReducaoAntiguidade,
    sourceUrl: AT_FOLHETO,
  },
  { year: 2026, kind: "isv_taxas_intermedias", payload: isvTaxasIntermedias, sourceUrl: ART8 },
  {
    year: 2026,
    kind: "isv_agravamento_diesel",
    payload: { amount: isvAgravamentoDiesel },
    sourceUrl: ISV_2026,
  },
  { year: 2026, kind: "iuc_cilindrada", payload: iucCilindrada, sourceUrl: IUC_2026 },
  { year: 2026, kind: "iuc_co2_wltp", payload: iucCo2Wltp, sourceUrl: IUC_2026 },
  { year: 2026, kind: "iuc_co2_nedc", payload: iucCo2Nedc, sourceUrl: IUC_2026 },
  { year: 2026, kind: "iuc_coef_ano", payload: iucCoefAno, sourceUrl: IUC_2026 },
  { year: 2026, kind: "iuc_adicional_diesel", payload: iucAdicionalDiesel, sourceUrl: IUC_2026 },
];
