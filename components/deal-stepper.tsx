import { Check } from "lucide-react";
import { DEAL_STAGES, STAGE_INDEX } from "@/lib/deal-stages";
import type { DealStageKey } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Stepper horizontal com todas as fases; a atual destacada. */
export function DealStepper({ stage }: { stage: DealStageKey }) {
  const current = STAGE_INDEX[stage];
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {DEAL_STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  done && "bg-good/15 text-good",
                  active && "bg-petrol text-white",
                  !done && !active && "bg-surface-2 text-ink-soft",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[10px] lg:block",
                  active ? "font-semibold text-ink" : "text-ink-soft",
                )}
              >
                {s.short}
              </span>
            </div>
            {i < DEAL_STAGES.length - 1 && (
              <span className={cn("h-px flex-1", i < current ? "bg-good/40" : "bg-line")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Versão compacta: "Fase 4 de 8 · Legalização" + barra. */
export function DealProgress({ stage }: { stage: DealStageKey }) {
  const current = STAGE_INDEX[stage];
  const total = DEAL_STAGES.length;
  const pct = ((current + 1) / total) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{DEAL_STAGES[current].label}</span>
        <span className="tnum text-ink-soft">
          {current + 1}/{total}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-steel" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
