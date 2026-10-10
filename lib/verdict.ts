import type { Verdict } from "./types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  compensa: "Compensa",
  marginal: "Marginal",
  nao_compensa: "Não compensa",
};

/**
 * Classe de cor semântica por veredito. O âmbar (acento de marca) nunca
 * entra aqui — ver docs/01-DESIGN.md.
 */
export const VERDICT_STYLE: Record<Verdict, string> = {
  compensa: "bg-good-soft text-good",
  marginal: "bg-neutral-soft text-steel",
  nao_compensa: "bg-bad-soft text-bad",
};

export const VERDICT_DOT: Record<Verdict, string> = {
  compensa: "bg-good",
  marginal: "bg-steel",
  nao_compensa: "bg-bad",
};

/**
 * Deriva o veredito a partir da poupança percentual. Fica até o pipeline (P06)
 * passar a usar `verdictFromMargin`.
 * Regra de referência (o backend pode afinar os limiares):
 *   ≥ 7%  → compensa · 2–7% → marginal · < 2% → não compensa
 */
export function verdictFromSavings(savingsPct: number): Verdict {
  if (savingsPct >= 7) return "compensa";
  if (savingsPct >= 2) return "marginal";
  return "nao_compensa";
}

/** Limiares do veredito por margem bruta (o P09 deixa cada stand pôr os seus). */
export interface MarginThresholds {
  /** compensa: margem ≥ este valor em € … */
  compensaEur: number;
  /** … e ≥ esta percentagem do PVP */
  compensaPct: number;
  /** marginal: margem ≥ este valor em € */
  marginalEur: number;
}

/**
 * DEFAULT (plano §5): compensa ≥ 1 500 € e ≥ 6 %; marginal ≥ 500 €. 7 % de
 * poupança num carro de 20 000 € não pagava preparação nem garantia.
 */
export const DEFAULT_MARGIN_THRESHOLDS: MarginThresholds = {
  compensaEur: 1500,
  compensaPct: 6,
  marginalEur: 500,
};

/** Veredito a partir da margem bruta estimada (€ e % do PVP). */
export function verdictFromMargin(
  grossMargin: number,
  grossMarginPct: number,
  thresholds: MarginThresholds = DEFAULT_MARGIN_THRESHOLDS,
): Verdict {
  if (grossMargin >= thresholds.compensaEur && grossMarginPct >= thresholds.compensaPct) {
    return "compensa";
  }
  if (grossMargin >= thresholds.marginalEur) return "marginal";
  return "nao_compensa";
}
