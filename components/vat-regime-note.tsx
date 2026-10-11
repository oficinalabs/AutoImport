import { ORIGIN_VAT_PCT, vatNote } from "@/lib/country-guides";
import { formatEuro } from "@/lib/format";
import type { CostBreakdown, CountryCode, SourceVatRegime } from "@/lib/types";

/**
 * Bloco "Regime de IVA" da ficha: o que o anúncio diz, o regime que a conta usou,
 * o preço líquido e a caução quando é dedutível, e uma frase sobre a revenda.
 * A caução é dinheiro parado até à prova de transporte, não custo (plano §0.2).
 */
export function VatRegimeNote({
  source,
  cost,
  country,
}: {
  source?: SourceVatRegime;
  cost: CostBreakdown;
  country: CountryCode;
}) {
  const note = vatNote(source, cost, country);
  const dedutivel = cost.vatRegime === "dedutivel";
  const rows: { label: string; value: string }[] = [
    { label: "O anúncio diz", value: note.said },
    { label: "Contámos como", value: note.applied },
  ];
  if (dedutivel && cost.originPriceNet != null)
    rows.push({ label: "Preço sem IVA", value: formatEuro(cost.originPriceNet) });
  if (dedutivel && cost.vatDeposit)
    rows.push({
      label: `Caução de IVA (${ORIGIN_VAT_PCT[country]} %)`,
      value: formatEuro(cost.vatDeposit),
    });

  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Regime de IVA
      </h3>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm"
          >
            <dt className="text-ink-soft">{r.label}</dt>
            <dd className="tnum text-right font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">{note.explanation}</p>
      {dedutivel && cost.vatDeposit ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          A caução não é custo: o vendedor devolve-a quando recebe a CMR e a declaração de chegada.
          Conta com ela na tesouraria.
        </p>
      ) : null}
    </div>
  );
}
