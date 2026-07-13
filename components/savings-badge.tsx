import { formatEuro, formatPercent } from "@/lib/format";
import type { Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<Verdict, string> = {
  compensa: "text-good",
  marginal: "text-steel",
  nao_compensa: "text-bad",
};

/**
 * Realça a poupança — o elemento mais visível de cada anúncio.
 * `size="lg"` para páginas de detalhe; `sm` para cartões.
 */
export function SavingsBadge({
  savings,
  savingsPct,
  verdict,
  size = "sm",
  className,
}: {
  savings: number;
  savingsPct: number;
  verdict: Verdict;
  size?: "sm" | "lg";
  className?: string;
}) {
  const positive = savings > 0;
  return (
    <div className={cn("tnum font-display leading-none", TONE[verdict], className)}>
      <div className={cn("font-bold", size === "lg" ? "text-3xl" : "text-lg")}>
        {positive ? "−" : "+"}
        {formatEuro(Math.abs(savings))}
      </div>
      <div
        className={cn(
          "mt-1 font-sans font-medium uppercase tracking-wide text-ink-soft",
          size === "lg" ? "text-xs" : "text-[11px]",
        )}
      >
        {positive ? "poupança" : "mais caro"} · {formatPercent(Math.abs(savingsPct), false)}
      </div>
    </div>
  );
}
