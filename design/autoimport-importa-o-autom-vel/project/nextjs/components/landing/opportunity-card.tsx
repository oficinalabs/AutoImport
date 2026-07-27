import Image from "next/image";
import type { Opportunity } from "./data";

const VERDICT_STYLES: Record<Opportunity["verdict"], { chip: string; value: string }> = {
  compensa: { chip: "bg-good-soft text-good", value: "text-good" },
  marginal: { chip: "bg-amber/12 text-amber", value: "text-amber" },
  "nao-compensa": { chip: "bg-bad-soft text-bad", value: "text-bad" },
};

export function OpportunityCard({ car }: { car: Opportunity }) {
  const v = VERDICT_STYLES[car.verdict];

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-md border border-line bg-paper">
      <div className="relative aspect-16/10 border-b border-line bg-surface">
        <Image src={car.photo} alt={car.title} fill sizes="(max-width: 640px) 100vw, 25vw" className="object-cover" />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="flex items-center gap-2 font-archivo font-semibold">
          <span aria-hidden>{car.flag}</span>
          {car.title}
        </h3>
        <p className="tnum text-sm text-ink-soft">{car.meta}</p>

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-2.5">
          <span className="text-xs text-ink-soft">Custo final</span>
          <span className="tnum font-mono font-semibold">{car.finalCost}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.chip}`}>
            {car.verdictLabel}
          </span>
          <span className={`tnum font-mono font-semibold ${v.value}`}>{car.saving}</span>
        </div>
      </div>
    </article>
  );
}
