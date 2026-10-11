import { formatEuro, formatPercent } from "@/lib/format";
import type { Listing, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<Verdict, string> = {
  compensa: "text-good",
  marginal: "text-steel",
  nao_compensa: "text-bad",
};

/**
 * O número principal de um anúncio: a **margem bruta** estimada (o que fica ao
 * stand depois de pagar o carro, a importação e o IVA da revenda) quando o motor
 * novo a calculou; a poupança antiga face ao preço PT enquanto não (anúncios
 * publicados antes do motor novo não têm margem). É o mesmo critério por que a
 * pesquisa ordena (`MARGEM` em lib/queries.ts).
 */
export function numeroPrincipal(l: Pick<Listing, "cost" | "savings" | "savingsPct">) {
  return escolher({ ...l.cost, savings: l.savings, savingsPct: l.savingsPct });
}

function escolher(n: {
  grossMargin?: number;
  grossMarginPct?: number;
  savings: number;
  savingsPct: number;
}): { kind: "margem" | "poupanca"; value: number; pct: number } {
  return n.grossMargin != null
    ? { kind: "margem", value: n.grossMargin, pct: n.grossMarginPct ?? 0 }
    : { kind: "poupanca", value: n.savings, pct: n.savingsPct };
}

/**
 * Realça a margem — o elemento mais visível de cada anúncio.
 * `size="lg"` para páginas de detalhe; `sm` para cartões.
 *
 * Sem sinal quando é a favor do stand: "−95 958 €" lia-se como prejuízo quando
 * era poupança (MVP.md). O sinal só aparece quando o número é contra.
 *
 * `grossMargin` é opcional para quem ainda só passa a poupança (a ficha); sem ele
 * mostra a poupança, como antes.
 */
export function SavingsBadge({
  savings,
  savingsPct,
  grossMargin,
  grossMarginPct,
  verdict,
  size = "sm",
  className,
}: {
  savings: number;
  savingsPct: number;
  grossMargin?: number;
  grossMarginPct?: number;
  verdict: Verdict;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { kind, value, pct } = escolher({ grossMargin, grossMarginPct, savings, savingsPct });
  const positive = value > 0;
  const label =
    kind === "margem"
      ? positive
        ? "margem"
        : "margem negativa"
      : positive
        ? "poupança"
        : "mais caro";
  return (
    <div
      className={cn(
        "tnum font-display leading-none",
        positive ? TONE[verdict] : "text-bad",
        className,
      )}
    >
      <div className={cn("font-bold", size === "lg" ? "text-3xl" : "text-lg")}>
        {positive ? "" : kind === "margem" ? "−" : "+"}
        {formatEuro(Math.abs(value))}
      </div>
      <div
        className={cn(
          "mt-1 font-sans font-medium uppercase tracking-wide text-ink-soft",
          size === "lg" ? "text-xs" : "text-[11px]",
        )}
      >
        {label} · {formatPercent(Math.abs(pct), false)}
      </div>
    </div>
  );
}
