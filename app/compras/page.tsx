import { Check, Circle } from "lucide-react";
import { CarImage } from "@/components/car-image";
import { CountryFlag } from "@/components/country-flag";
import { DealStepper } from "@/components/deal-stepper";
import { getDeals } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function ComprasPage() {
  const deals = await getDeals();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Compras</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Estado de cada importação, da negociação à matrícula portuguesa.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {deals.map((d) => (
          <div key={d.id} className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <CarImage label={d.title} className="size-16 shrink-0" />
                <div>
                  <h2 className="font-display font-semibold">{d.title}</h2>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
                    <CountryFlag code={d.country} />
                    <span>·</span>
                    <span className="tnum">{formatEuro(d.totalPt)}</span>
                    <span>·</span>
                    <span className="tnum font-medium text-good">poupa {formatEuro(d.savings)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stepper */}
            <div className="mt-5">
              <DealStepper stage={d.stage} />
            </div>

            {/* Próxima ação + checklist */}
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-[1fr_1fr]">
              {d.nextAction && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-soft">Próxima ação</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                    <span className="size-1.5 rounded-full bg-amber" />
                    {d.nextAction}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-wide text-ink-soft">Documentos</div>
                <ul className="flex flex-col gap-1">
                  {d.checklist.map((c) => (
                    <li
                      key={c.label}
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        c.done ? "text-ink-soft line-through" : "text-ink",
                      )}
                    >
                      {c.done ? (
                        <Check className="size-3.5 text-good" />
                      ) : (
                        <Circle className="size-3.5 text-ink-soft" />
                      )}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
