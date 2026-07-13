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
 * Deriva o veredito a partir da poupança percentual.
 * Regra de referência (o backend pode afinar os limiares):
 *   ≥ 7%  → compensa · 2–7% → marginal · < 2% → não compensa
 */
export function verdictFromSavings(savingsPct: number): Verdict {
  if (savingsPct >= 7) return "compensa";
  if (savingsPct >= 2) return "marginal";
  return "nao_compensa";
}
