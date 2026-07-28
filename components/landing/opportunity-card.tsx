import { CarImage } from "@/components/car-image";
import { country } from "@/lib/countries";
import { formatEuro, formatKm } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<Listing["verdict"], { chip: string; value: string; label: string }> = {
  compensa: {
    chip: "bg-emerald-400/12 text-emerald-300",
    value: "text-emerald-300",
    label: "Compensa",
  },
  marginal: { chip: "bg-amber-400/12 text-amber-300", value: "text-amber-300", label: "Marginal" },
  nao_compensa: {
    chip: "bg-red-400/12 text-red-300",
    value: "text-red-300",
    label: "Não compensa",
  },
};

/**
 * Cartão de oportunidade na landing. Só leitura, sem favoritar — quem está aqui
 * ainda não tem conta. Alimentado por anúncios reais (getTopOpportunities).
 *
 * ⚠️ Cores fixas em vez dos tokens do tema: este cartão vive SEMPRE sobre a
 * landing escura, que não muda com o tema claro/escuro do utilizador. Usar
 * `bg-surface`/`text-ink` aqui dava texto escuro sobre fundo escuro para quem
 * tem o tema claro. É o oposto da regra do resto da app — por isso o aviso.
 *
 * `prefer="catalog"`: aqui os carros aparecem em fila, e as fotos dos anúncios
 * vêm de ~24 fontes — recorte de estúdio sobre branco ao lado de foto de stand
 * com pendão e marca de água. Em fila isso lê-se como desleixo.
 */
export function OpportunityCard({ car }: { car: Listing }) {
  const v = VERDICT[car.verdict];
  const c = country(car.country);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04] transition-colors hover:border-white/20 hover:bg-white/[0.07]">
      <CarImage
        photo={car.images[0]}
        catalog={car.catalogImage}
        prefer="catalog"
        label={car.title}
        className="aspect-[16/10] w-full border-b border-white/10"
        rounded="rounded-none"
      />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold leading-tight text-white">
          <span aria-hidden>{c.flag}</span>
          <span className="min-w-0 truncate">{car.title}</span>
        </h3>
        <p className="tnum text-[11px] uppercase tracking-[0.08em] text-white/40">
          {car.year} · {formatKm(car.km)} · {c.name}
        </p>

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-white/10 pt-3">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">Custo final</span>
          <span className="tnum text-lg font-bold tracking-tight text-white">
            {formatEuro(car.cost.totalPt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
              v.chip,
            )}
          >
            {v.label}
          </span>
          <span className={cn("tnum text-sm font-bold", v.value)}>+{formatEuro(car.savings)}</span>
        </div>
      </div>
    </article>
  );
}
