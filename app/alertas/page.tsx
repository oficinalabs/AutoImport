import { BellPlus, BellRing } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { Button } from "@/components/ui/button";
import { getAlerts } from "@/lib/data";

export default async function AlertasPage() {
  const alerts = await getAlerts();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alertas</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Avisamos-te por email quando aparece um carro que bate os teus critérios.
          </p>
        </div>
        <Button variant="accent">
          <BellPlus className="size-4" /> Novo alerta
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-surface p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BellRing className="size-4 text-steel" />
                <h2 className="font-semibold">{a.name}</h2>
                {a.matchCount > 0 && (
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">
                    {a.matchCount} matches
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{a.criteria}</p>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                {a.countries.map((c) => (
                  <CountryFlag key={c} code={c} showName={false} />
                ))}
              </div>
            </div>

            {/* Toggle ativo/inativo (visual) */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <span className="text-ink-soft">{a.active ? "Ativo" : "Inativo"}</span>
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  a.active ? "bg-good" : "bg-line-strong"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
                    a.active ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
              <input type="checkbox" defaultChecked={a.active} className="sr-only" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
