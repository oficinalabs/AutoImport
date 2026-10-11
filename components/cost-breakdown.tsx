import { formatEuro, formatPercent } from "@/lib/format";
import type { StandCostField } from "@/lib/stand-costs";
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

/** Linhas que o stand pode definir em /stand; as outras vêm sempre do anúncio ou da lei. */
const STAND_FIELD: Partial<Record<string, StandCostField>> = {
  transport: "transport",
  legalization: "legalization",
  despachante: "despachante",
  preparation: "preparation",
};

function Row({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  /** "teu" (custo do stand) ou "média" (valor publicado) */
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line py-2 text-sm",
        className,
      )}
    >
      <dt className="text-ink-soft">
        {label}
        {note && <span className="ml-1.5 text-xs text-ink-soft/70">({note})</span>}
      </dt>
      <dd className="tnum font-mono">{value}</dd>
    </div>
  );
}

/**
 * Custo de importar até estar legalizado em PT e, quando o motor novo já correu
 * (`grossMargin` definido), a margem bruta na revenda ao preço PT estimado.
 * Em IVA dedutível o preço de compra é o líquido (`originPriceNet`).
 *
 * `standCosts` (P09) diz que parcelas vieram dos custos do stand; as linhas que o
 * stand pode definir levam "teu" ou "média". Sem `standCosts` (stand sem custos
 * próprios) são todas médias, e uma nota no fim diz isso.
 */
export function CostBreakdown({
  cost,
  ptPrice,
  standCosts,
}: {
  cost: Breakdown;
  ptPrice: number;
  standCosts?: StandCostField[];
}) {
  const dedutivel = cost.vatRegime === "dedutivel" && cost.originPriceNet != null;
  const origem = (key: string) => {
    const field = STAND_FIELD[key];
    if (!field || !standCosts) return undefined;
    return standCosts.includes(field) ? "teu" : "média";
  };
  const rows: { key: string; label: string; value: number }[] = LINES.map(({ key, label }) =>
    key === "originPrice" && dedutivel
      ? { key, label: "Preço de compra sem IVA", value: cost.originPriceNet as number }
      : { key, label, value: cost[key] },
  );
  if (cost.despachante || standCosts?.includes("despachante"))
    rows.push({ key: "despachante", label: "Despachante", value: cost.despachante ?? 0 });
  if (cost.preparation || standCosts?.includes("preparation"))
    rows.push({ key: "preparation", label: "Preparação e garantia", value: cost.preparation ?? 0 });
  const temMargem = cost.grossMargin !== undefined;

  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Custo de importar
      </h3>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={formatEuro(r.value)} note={origem(r.key)} />
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

      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        {standCosts
          ? [
              "“teu” é o valor que definiste em Stand; “média” é a conta publicada para todos.",
              standCosts.includes("vat") && "Sem VIES: contámos a compra em regime de margem.",
              standCosts.includes("threshold") && "O veredito usa a tua margem mínima.",
            ]
              .filter(Boolean)
              .join(" ")
          : "Transporte, legalização, despachante e preparação são médias. Define os teus custos em Stand."}
      </p>
    </div>
  );
}
