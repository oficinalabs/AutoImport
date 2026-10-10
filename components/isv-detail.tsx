import { co2Norm } from "@/lib/cost-engine";
import { formatCc, formatEuro } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { ChevronDown } from "lucide-react";

/**
 * Como se chegou ao ISV. O detalhe por componente (cilindrada, ambiental,
 * redução) é gravado pelo motor em `import_cost_estimates.inputs.isv`, mas a
 * publicação não leva o `inputs` para a base da app; por isso a ficha mostra os
 * dados do carro que entram na conta e as regras, não os valores de cada parcela.
 */
export function IsvDetail({ listing }: { listing: Listing }) {
  const m = listing.model;
  const eletrico = m.fuel === "elétrico";
  const norma = co2Norm(listing.year) === "wltp" ? "WLTP" : "NEDC";
  const rows: { label: string; value: string }[] = eletrico
    ? [{ label: "Combustível", value: "Elétrico" }]
    : [
        {
          label: "Cilindrada",
          value: m.displacementCc ? formatCc(m.displacementCc) : "Não indicada",
        },
        {
          label: `CO₂ (${norma})`,
          value: m.co2 !== undefined ? `${m.co2} g/km` : "Não indicado",
        },
        { label: "Ano", value: String(listing.year) },
      ];

  return (
    <details className="group rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Como calculámos o ISV
        </span>
        <span className="flex items-center gap-1.5">
          <span className="tnum font-mono text-sm">{formatEuro(listing.cost.isv)}</span>
          <ChevronDown
            className="size-4 text-ink-soft transition-transform group-open:rotate-180"
            aria-hidden
          />
        </span>
      </summary>
      <dl className="mt-3 flex flex-col">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between border-b border-line py-2 text-sm"
          >
            <dt className="text-ink-soft">{r.label}</dt>
            <dd className="tnum font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      {eletrico ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Os elétricos estão isentos de ISV.
        </p>
      ) : (
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed text-ink-soft">
          <li>
            O ISV soma a componente de cilindrada e a componente ambiental (CO₂). Híbridos e plug-in
            podem ter taxa intermédia, e os diesel têm agravamento de partículas.
          </li>
          <li>
            A redução por antiguidade (10 % a 80 %) aplica-se às duas componentes e conta desde a
            1.ª matrícula. Contámos a idade de hoje: se o carro mudar de escalão antes da DAV, o ISV
            baixa.
          </li>
          <li>
            CO₂ pela tabela {norma}: usamos WLTP nos carros de 2019 em diante e NEDC antes. Em 2018
            e 2019 pode ser uma ou outra; a norma certa está no COC.
          </li>
          <li>
            Quando o anúncio não traz cilindrada ou CO₂, usámos os do catálogo do modelo. Valor
            estimado com as tabelas de 2026: confirma na Autoridade Tributária antes de fechar.
          </li>
        </ul>
      )}
    </details>
  );
}
