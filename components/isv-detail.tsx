import { co2Norm } from "@/lib/cost-engine";
import { formatCc, formatEuro } from "@/lib/format";
import type { IsvParts, Listing } from "@/lib/types";
import { ChevronDown } from "lucide-react";

/** As parcelas como o motor as somou: (cilindrada + ambiental) × taxa + agravamento,
 * menos a redução por antiguidade. Os zeros e a taxa normal não se mostram. */
function partRows(p: IsvParts, norma: string): { label: string; value: string }[] {
  const rows = [
    { label: "Componente cilindrada", value: formatEuro(p.cilindrada) },
    { label: `Componente ambiental (CO₂ ${norma})`, value: formatEuro(p.ambiental) },
  ];
  if (p.taxaPct !== 100) rows.push({ label: "Taxa intermédia", value: `${p.taxaPct} %` });
  if (p.agravamentoDiesel > 0)
    rows.push({ label: "Agravamento de partículas", value: formatEuro(p.agravamentoDiesel) });
  if (p.reducaoPct > 0)
    rows.push({ label: "Redução por antiguidade", value: `−${p.reducaoPct} %` });
  return rows;
}

/**
 * Como se chegou ao ISV: os dados do carro que entram na conta, as parcelas que o
 * motor gravou em `import_cost_estimates.inputs.isv` (quando a estimativa já as
 * trouxe na publicação) e as regras.
 */
export function IsvDetail({ listing }: { listing: Listing }) {
  const m = listing.model;
  const eletrico = m.fuel === "elétrico";
  const parts = eletrico ? undefined : listing.isvParts;
  // A norma que o motor usou (pela data da 1.ª matrícula) manda; sem ela, a do ano.
  const norm = parts && parts.norm !== "n/a" ? parts.norm : co2Norm(listing.year);
  const norma = norm === "wltp" ? "WLTP" : "NEDC";
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
      {parts && (
        <dl className="mt-3 flex flex-col">
          {partRows(parts, norma).map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between border-b border-line py-2 text-sm"
            >
              <dt className="text-ink-soft">{r.label}</dt>
              <dd className="tnum font-mono">{r.value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 text-sm font-semibold">
            <dt>ISV</dt>
            <dd className="tnum font-mono">{formatEuro(listing.cost.isv)}</dd>
          </div>
        </dl>
      )}
      {parts && parts.assumptions.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-warn">
          Assumimos: {parts.assumptions.join("; ")}.
        </p>
      )}
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
