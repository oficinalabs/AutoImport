import type { DealStageKey } from "./types";

/** Fases do pipeline de importação, por ordem. Ver docs/03-BACKEND.md. */
export const DEAL_STAGES: { key: DealStageKey; label: string; short: string }[] = [
  { key: "interessado", label: "Interessado", short: "Interesse" },
  { key: "negociacao", label: "Em negociação", short: "Negociação" },
  { key: "acordo", label: "Acordo fechado", short: "Acordo" },
  { key: "pagamento", label: "Sinal / Pagamento", short: "Pagamento" },
  { key: "transporte", label: "Transporte", short: "Transporte" },
  { key: "legalizacao", label: "Legalização & ISV", short: "Legalização" },
  { key: "matricula", label: "Matrícula PT", short: "Matrícula" },
  { key: "concluido", label: "Concluído", short: "Concluído" },
];

export const STAGE_INDEX: Record<DealStageKey, number> = Object.fromEntries(
  DEAL_STAGES.map((s, i) => [s.key, i]),
) as Record<DealStageKey, number>;

export function stageLabel(key: DealStageKey): string {
  return DEAL_STAGES[STAGE_INDEX[key]].label;
}
