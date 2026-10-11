import { formatEuro, formatPercent } from "@/lib/format";
import type { StandCostField } from "@/lib/stand-costs";
import type { CostBreakdown as Breakdown } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  fromStand = false,
  className,
}: {
  label: string;
  value: string;
  /** o valor é o que o stand definiu, não a média publicada */
  fromStand?: boolean;
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
        {fromStand && (
          <span className="ml-1.5 rounded-sm bg-surface-2 px-1 py-px text-[11px] font-medium text-ink">
            do stand
          </span>
        )}
      </dt>
      <dd className="tnum font-mono">{value}</dd>
    </div>
  );
}

/**
 * Custo de importar até estar legalizado em PT e, quando o motor novo já correu
 * (`grossMargin` definido), a margem bruta na revenda ao preço PT estimado.
 * Em IVA dedutível o preço de compra é o líquido (`originPriceNet`).
 */
export function CostBreakdown({
  cost,
  ptPrice,
  standCosts = [],
}: {
  cost: Breakdown;
  ptPrice: number;
  /** parcelas que vêm dos custos do stand (P09); o resto são médias */
  standCosts?: StandCostField[];
}) {
  const doStand = (field: StandCostField) => standCosts.includes(field);
  const dedutivel = cost.vatRegime === "dedutivel" && cost.originPriceNet != null;
  const rows: { label: string; value: number; fromStand?: boolean }[] = LINES.map(
    ({ key, label }) =>
      key === "originPrice" && dedutivel
        ? { label: "Preço de compra sem IVA", value: cost.originPriceNet as number }
        : {
            label,
            value: cost[key],
            fromStand: (key === "transport" || key === "legalization") && doStand(key),
          },
  );
  if (cost.despachante)
    rows.push({
      label: "Despachante",
      value: cost.despachante,
      fromStand: doStand("despachante"),
    });
  if (cost.preparation)
    rows.push({
      label: "Preparação e garantia",
      value: cost.preparation,
      fromStand: doStand("preparation"),
    });
  const temMargem = cost.grossMargin !== undefined;
  const marcadas = rows.some((r) => r.fromStand);

  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Custo de importar
      </h3>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={formatEuro(r.value)} fromStand={r.fromStand} />
        ))}
        <div className="flex items-center justify-between pt-3">
          <dt className="font-display font-semibold">Total em Portugal</dt>
          <dd className="tnum font-mono text-lg font-bold">{formatEuro(cost.totalPt)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-soft">
        {marcadas
          ? "As parcelas marcadas são os custos do teu stand; as outras são médias. "
          : "Transporte, legalização e preparação são médias. "}
        {doStand("threshold") && "O veredito usa o limiar de margem do stand. "}
        <Link href="/stand" className="underline underline-offset-2 hover:text-ink">
          {standCosts.length > 0 ? "Alterar custos do stand" : "Usar os custos do teu stand"}
        </Link>
      </p>

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
