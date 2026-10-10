import { formatEuro, formatPercent } from "@/lib/format";
import type { CostBreakdown as Breakdown } from "@/lib/types";
import { cn } from "@/lib/utils";

const LINES: {
  key: "originPrice" | "transport" | "isv" | "iuc" | "legalization";
  label: string;
}[] = [
  { key: "originPrice", label: "Preço na origem" },
  { key: "transport", label: "Transporte" },
  { key: "isv", label: "ISV" },
  { key: "iuc", label: "IUC (1.º ano)" },
  { key: "legalization", label: "Legalização" },
];

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line py-2 text-sm",
        className,
      )}
    >
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum font-mono">{value}</dd>
    </div>
  );
}

/**
 * Custo de importar até estar legalizado em PT e, quando o motor novo já correu
 * (`grossMargin` definido), a margem bruta na revenda ao preço PT estimado.
 * Em IVA dedutível o preço de compra é o líquido (`originPriceNet`).
 */
export function CostBreakdown({ cost, ptPrice }: { cost: Breakdown; ptPrice: number }) {
  const dedutivel = cost.vatRegime === "dedutivel" && cost.originPriceNet != null;
  const rows: { label: string; value: number }[] = LINES.map(({ key, label }) =>
    key === "originPrice" && dedutivel
      ? { label: "Preço de compra sem IVA", value: cost.originPriceNet as number }
      : { label, value: cost[key] },
  );
  if (cost.despachante) rows.push({ label: "Despachante", value: cost.despachante });
  if (cost.preparation) rows.push({ label: "Preparação e garantia", value: cost.preparation });
  const temMargem = cost.grossMargin !== undefined;

  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Custo de importar
      </h3>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={formatEuro(r.value)} />
        ))}
        <div className="flex items-center justify-between pt-3">
          <dt className="font-display font-semibold">Total em Portugal</dt>
          <dd className="tnum font-mono text-lg font-bold">{formatEuro(cost.totalPt)}</dd>
        </div>
      </dl>

      {temMargem && (
        <>
          <h3 className="mb-1 mt-5 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Margem na revenda
          </h3>
          <dl className="flex flex-col">
            <Row label="Preço de venda estimado em PT" value={formatEuro(ptPrice)} />
            <Row label="Custo total" value={`− ${formatEuro(cost.totalPt)}`} />
            {cost.outputVat !== undefined && (
              <Row label="IVA a liquidar na revenda" value={`− ${formatEuro(cost.outputVat)}`} />
            )}
            <div className="flex items-center justify-between gap-3 pt-3">
              <dt className="font-display font-semibold">Margem bruta</dt>
              <dd
                className={cn(
                  "tnum font-mono text-lg font-bold",
                  (cost.grossMargin as number) < 0 && "text-bad",
                )}
              >
                {formatEuro(cost.grossMargin as number)}
                {cost.grossMarginPct !== undefined && (
                  <span className="ml-1.5 text-xs font-medium text-ink-soft">
                    {formatPercent(cost.grossMarginPct, false)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
