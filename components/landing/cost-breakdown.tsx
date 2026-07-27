"use client";

import { country } from "@/lib/countries";
import { formatEuro, formatKm } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * A peça central da landing: a conta do ISV, aberta, sobre um anúncio REAL que
 * está à venda agora. É o momento "ah, é isto" — o custo que ninguém quer
 * calcular, decomposto ao lado da comparação com o mercado português.
 */
export function LandingCostBreakdown({ car }: { car: Listing }) {
  const [open, setOpen] = useState(true);
  const c = country(car.country);
  const { cost, ptMarket } = car;

  const isvPct = cost.totalPt > 0 ? Math.round((cost.isv / cost.totalPt) * 100) : 0;
  // Barras proporcionais ao maior dos dois valores.
  const max = Math.max(cost.totalPt, ptMarket.estimatedPrice) || 1;

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-paper">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <span aria-hidden className="text-lg">
          {c.flag}
        </span>
        <h3 className="font-display font-semibold">{car.title}</h3>
        <p className="tnum text-sm text-ink-soft">
          {car.year} · {formatKm(car.km)}
          {car.model.powerHp ? ` · ${car.model.powerHp} cv` : ""}
        </p>
        <p className="ml-auto text-xs text-steel">Anúncio em {c.name}</p>
      </header>

      <div className="grid lg:grid-cols-2">
        {/* A conta */}
        <div className="px-5 pt-2 pb-5 lg:border-r lg:border-line">
          <dl>
            <Row label={`Preço na origem (${c.name})`} value={formatEuro(cost.originPrice)} />
            <Row label="Transporte até PT" value={formatEuro(cost.transport)} />
          </dl>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2 flex w-full items-center justify-between gap-4 rounded-[8px] bg-amber-soft px-3 py-3.5 text-left"
          >
            <span>
              <span className="flex items-center gap-1.5 font-display font-semibold">
                ISV
                <ChevronDown
                  className={cn("size-3.5 transition-transform", open && "rotate-180")}
                  aria-hidden
                />
              </span>
              <span className="block text-xs text-ink-soft">
                <span className="tnum">{isvPct}%</span> do custo total. Cobrado à chegada.
              </span>
            </span>
            <span className="tnum text-lg font-semibold text-amber">{formatEuro(cost.isv)}</span>
          </button>

          {open && (
            <div className="mt-0.5 rounded-[8px] bg-surface p-3">
              <dl>
                {car.model.displacementCc && (
                  <SubRow label={`Cilindrada (${car.model.displacementCc} cm³)`} />
                )}
                {car.model.co2 !== undefined && (
                  <SubRow label={`Componente ambiental (${car.model.co2} g/km CO₂)`} />
                )}
                <SubRow label={`Redução por anos de uso (${idade(car.year)})`} good />
              </dl>
              <dl className="mt-1 border-t border-line pt-1">
                <SubRow label="IUC (1.º ano)" value={formatEuro(cost.iuc)} />
                <SubRow label="Legalização" value={formatEuro(cost.legalization)} />
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-steel">
                Tabela do ISV de {new Date().getFullYear()}: componente de cilindrada + componente
                ambiental, com redução por anos de uso. Estimativa — quem fixa o valor é a
                Alfândega.
              </p>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-4 border-t-2 border-line-strong pt-4">
            <span className="font-display font-semibold">Custo final em Portugal</span>
            <span className="tnum font-display text-2xl font-bold">{formatEuro(cost.totalPt)}</span>
          </div>
        </div>

        {/* A comparação */}
        <div className="flex flex-col gap-4 bg-surface p-5">
          <Bar
            label="Custo final importado"
            value={formatEuro(cost.totalPt)}
            pct={(cost.totalPt / max) * 100}
            tone="petrol"
          />
          <Bar
            label="Mercado português"
            value={formatEuro(ptMarket.estimatedPrice)}
            pct={(ptMarket.estimatedPrice / max) * 100}
            tone="steel"
          />

          <div className="rounded-[8px] bg-good-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-good">
              Poupança estimada
            </p>
            <p className="tnum font-display text-3xl font-bold leading-tight text-good">
              {formatEuro(car.savings)}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              contra a mediana de <span className="tnum">{ptMarket.sampleSize}</span> anúncios
              portugueses do mesmo modelo e ano.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3">
      <dt className="text-[15px] text-ink-soft">{label}</dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  );
}

/** Linha da decomposição do ISV. Sem `value`, só nomeia a parcela — o valor
 *  exato de cada componente vive na engine, não no contrato do Listing. */
function SubRow({ label, value, good }: { label: string; value?: string; good?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      {value && <dd className={cn("tnum", good ? "text-good" : "text-ink")}>{value}</dd>}
    </div>
  );
}

function idade(year: number): string {
  const anos = new Date().getFullYear() - year;
  return anos <= 0 ? "novo" : anos === 1 ? "1 ano" : `${anos} anos`;
}

function Bar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: "petrol" | "steel";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-soft">{label}</span>
        <span
          className={cn("tnum font-semibold", tone === "petrol" ? "text-ink" : "text-ink-soft")}
        >
          {value}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full", tone === "petrol" ? "bg-petrol" : "bg-line-strong")}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
