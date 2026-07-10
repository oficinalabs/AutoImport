import { ChevronDown, Info } from "lucide-react";
import { formatEuro } from "@/lib/format";
import type { CostBreakdown as Breakdown } from "@/lib/types";

const LINES: { key: keyof Omit<Breakdown, "totalPt">; label: string }[] = [
  { key: "originPrice", label: "Preço na origem" },
  { key: "transport", label: "Transporte" },
  { key: "isv", label: "ISV" },
  { key: "iuc", label: "IUC (1.º ano)" },
  { key: "legalization", label: "Legalização" },
];

export function CostBreakdown({ cost }: { cost: Breakdown }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Custo de importar
      </h3>
      <dl className="flex flex-col">
        {LINES.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between border-b border-line py-2 text-sm"
          >
            <dt className="flex items-center gap-1.5 text-ink-soft">
              {label}
              {key === "isv" && (
                <span className="text-amber" title="Imposto Sobre Veículos">
                  <Info className="size-3.5" />
                </span>
              )}
            </dt>
            <dd className="tnum font-mono">{formatEuro(cost[key])}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3">
          <dt className="font-display font-semibold">Total em Portugal</dt>
          <dd className="tnum font-mono text-lg font-bold">{formatEuro(cost.totalPt)}</dd>
        </div>
      </dl>

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-petrol-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          Como calculámos o ISV
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          O ISV soma a componente de cilindrada e a componente ambiental (CO₂), com
          redução por antiguidade do veículo (10% a 80%). É normalmente o maior custo
          isolado da importação. Valor estimado com as tabelas de 2026 — confirmar na
          Autoridade Tributária antes de fechar negócio.
        </p>
      </details>
    </div>
  );
}
