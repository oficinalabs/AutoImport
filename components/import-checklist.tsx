import { COUNTRY_GUIDES } from "@/lib/country-guides";
import type { CountryCode } from "@/lib/types";
import { TriangleAlert } from "lucide-react";

/**
 * O que pedir e verificar para comprar neste país, pela ordem da compra, e os
 * sinais de risco típicos de lá. Conteúdo de lib/country-guides.ts.
 */
export function ImportChecklist({ country }: { country: CountryCode }) {
  const guide = COUNTRY_GUIDES[country];
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Comprar {guide.where}: o que pedir e verificar
      </h2>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
        {guide.checklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <div className="mt-4 rounded-[8px] bg-amber-soft p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-ink">
          <TriangleAlert className="size-3.5" aria-hidden /> Atenção
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed">
          {guide.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
        Orientação prática a partir das regras de cada país, não é aconselhamento fiscal nem
        jurídico.
      </p>
    </div>
  );
}
