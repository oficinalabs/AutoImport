import { CarImage } from "@/components/car-image";
import { country } from "@/lib/countries";
import { formatEuro, formatKm } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<Listing["verdict"], { chip: string; value: string; label: string }> = {
  compensa: { chip: "bg-good-soft text-good", value: "text-good", label: "Compensa" },
  marginal: { chip: "bg-amber-soft text-amber", value: "text-amber", label: "Marginal" },
  nao_compensa: { chip: "bg-bad-soft text-bad", value: "text-bad", label: "Não compensa" },
};

/**
 * Cartão de oportunidade na landing. Só leitura, sem favoritar — quem está aqui
 * ainda não tem conta. Alimentado por anúncios reais (getTopOpportunities).
 *
 * ⚠️ `bg-surface`, não `bg-paper`: a secção onde vive tem fundo `paper`, logo um
 * cartão `bg-paper` fica invisível — só se via pela borda, e era isso que fazia
 * a fila parecer uma grelha de retângulos vazios. Igual ao `car-card.tsx`.
 */
export function OpportunityCard({ car }: { car: Listing }) {
  const v = VERDICT[car.verdict];
  const c = country(car.country);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
      <CarImage
        photo={car.images[0]}
        catalog={car.catalogImage}
        label={car.title}
        className="aspect-[16/10] w-full border-b border-line"
        rounded="rounded-none"
      />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold leading-tight">
          <span aria-hidden>{c.flag}</span>
          <span className="min-w-0 truncate">{car.title}</span>
        </h3>
        <p className="tnum text-sm text-ink-soft">
          {car.year} · {formatKm(car.km)} · {c.name}
        </p>

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-2.5">
          <span className="text-xs text-ink-soft">Custo final</span>
          <span className="tnum font-semibold">{formatEuro(car.cost.totalPt)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", v.chip)}>
            {v.label}
          </span>
          <span className={cn("tnum font-semibold", v.value)}>+{formatEuro(car.savings)}</span>
        </div>
      </div>
    </article>
  );
}
