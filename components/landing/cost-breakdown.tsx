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
 *
 * ⚠️ Cores fixas em vez dos tokens do tema (`bg-white/[0.05]` e não
 * `bg-surface`): a landing é escura sempre, independentemente do tema
 * claro/escuro do utilizador. Um token aqui dava texto escuro sobre fundo
 * escuro para quem tem o tema claro. É o oposto da regra do resto da app.
 *
 * ⚠️ Nada de `<header>` aqui dentro: o globals.css escurece o cabeçalho do site
 * na landing, e um `<header>` neste bloco já apanhou a regra e ficou com uma
 * barra preta no meio. Hoje o seletor é `[data-site-header]`, mas não vale a
 * pena tentar a sorte.
 */
export function LandingCostBreakdown({ car }: { car: Listing }) {
  const [open, setOpen] = useState(true);
  const c = country(car.country);
  const { cost, ptMarket } = car;

  const isvPct = cost.totalPt > 0 ? Math.round((cost.isv / cost.totalPt) * 100) : 0;
  // Barras proporcionais ao maior dos dois valores.
  const max = Math.max(cost.totalPt, ptMarket.estimatedPrice) || 1;

  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02))]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 px-5 py-4 sm:px-7">
        <span aria-hidden className="text-lg">
          {c.flag}
        </span>
        <h3 className="font-display text-lg font-bold tracking-tight text-white sm:text-xl">
          {car.title}
        </h3>
        <p className="tnum text-xs uppercase tracking-[0.1em] text-white/45">
          {car.year} · {formatKm(car.km)}
          {car.model.powerHp ? ` · ${car.model.powerHp} cv` : ""}
        </p>
        <p className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/35">
          Anúncio em {c.name}
        </p>
      </div>

      <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-12">
        {/* A conta */}
        <div>
          <dl>
            <Row label={`Preço na origem · ${c.name}`} value={formatEuro(cost.originPrice)} />
            <Row label="Transporte até PT" value={formatEuro(cost.transport)} />
          </dl>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-4 flex w-full items-center justify-between gap-4 rounded-[14px] border border-amber-400/25 bg-amber-400/[0.11] px-4 py-4 text-left transition-colors hover:bg-amber-400/[0.16]"
          >
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                ISV
                <ChevronDown
                  className={cn("size-3.5 transition-transform", open && "rotate-180")}
                  aria-hidden
                />
              </span>
              <span className="mt-0.5 block text-[11px] text-white/45">
                <span className="tnum">{isvPct}%</span> do custo total · cobrado à chegada
              </span>
            </span>
            <span className="tnum text-2xl font-bold tracking-tight text-amber-300">
              {formatEuro(cost.isv)}
            </span>
          </button>

          {open && (
            <div className="mt-1.5 rounded-[14px] bg-black/25 p-4">
              <dl>
                {car.model.displacementCc && (
                  <SubRow label={`Cilindrada (${car.model.displacementCc} cm³)`} />
                )}
                {car.model.co2 !== undefined && (
                  <SubRow label={`Componente ambiental (${car.model.co2} g/km CO₂)`} />
                )}
                <SubRow label={`Redução por anos de uso (${idade(car.year)})`} />
              </dl>
              <dl className="mt-1 border-t border-white/10 pt-1">
                <SubRow label="IUC (1.º ano)" value={formatEuro(cost.iuc)} />
                <SubRow label="Legalização" value={formatEuro(cost.legalization)} />
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-white/35">
                Tabela do ISV de {new Date().getFullYear()}: componente de cilindrada + componente
                ambiental, com redução por anos de uso. Estimativa — quem fixa o valor é a
                Alfândega.
              </p>
            </div>
          )}

          <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-white/20 pt-5">
            <span className="text-sm font-semibold text-white">Custo final em Portugal</span>
            <span className="tnum font-display text-3xl font-bold tracking-[-0.03em] text-white">
              {formatEuro(cost.totalPt)}
            </span>
          </div>
        </div>

        {/* A comparação */}
        <div className="flex flex-col gap-5">
          <Bar
            label="Custo final importado"
            value={formatEuro(cost.totalPt)}
            pct={(cost.totalPt / max) * 100}
            forte
          />
          <Bar
            label="Mercado português"
            value={formatEuro(ptMarket.estimatedPrice)}
            pct={(ptMarket.estimatedPrice / max) * 100}
          />

          <div className="rounded-[14px] border border-emerald-400/25 bg-emerald-400/[0.09] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Poupança estimada
            </p>
            <p className="tnum font-display text-4xl font-bold leading-tight tracking-[-0.035em] text-emerald-300">
              {formatEuro(car.savings)}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">
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
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] py-3">
      <dt className="text-sm text-white/55">{label}</dt>
      <dd className="tnum text-[15px] font-medium text-white">{value}</dd>
    </div>
  );
}

/** Linha da decomposição do ISV. Sem `value`, só nomeia a parcela — o valor
 *  exato de cada componente vive na engine, não no contrato do Listing. */
function SubRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[13px]">
      <dt className="text-white/45">{label}</dt>
      {value && <dd className="tnum text-white/75">{value}</dd>}
    </div>
  );
}

function idade(year: number): string {
  const anos = new Date().getFullYear() - year;
  return anos <= 0 ? "novo" : anos === 1 ? "1 ano" : `${anos} anos`;
}

/** `forte` marca o valor que interessa (o nosso); o outro é a referência. */
function Bar({
  label,
  value,
  pct,
  forte,
}: {
  label: string;
  value: string;
  pct: number;
  forte?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-white/55">{label}</span>
        <span className={cn("tnum font-semibold", forte ? "text-white" : "text-white/60")}>
          {value}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full",
            forte ? "bg-[linear-gradient(90deg,#5fbdd0,#3b8ea3)]" : "bg-white/25",
          )}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
