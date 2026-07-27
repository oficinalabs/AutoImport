"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const BASE_ROWS = [
  { label: "Preço na origem (Alemanha)", value: "21 400 €" },
  { label: "Transporte até PT", value: "950 €" },
];

const ISV_ROWS = [
  { label: "Componente cilindrada (1 995 cm³)", value: "4 986 €", good: false },
  { label: "Componente ambiental (128 g/km CO₂)", value: "8 043 €", good: false },
  { label: "Redução por anos de uso (4 anos)", value: "−6 819 €", good: true },
  { label: "IUC anual + legalização", value: "599 €", good: false },
];

export function CostBreakdown() {
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-paper">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <span aria-hidden className="text-lg">🇩🇪</span>
        <h3 className="font-archivo font-semibold">BMW 320d Touring</h3>
        <p className="tnum text-sm text-ink-soft">2021 · 78 400 km · 190 cv</p>
        <p className="ml-auto text-xs text-steel">Anúncio em Munique</p>
      </header>

      <div className="grid lg:grid-cols-2">
        {/* Ledger */}
        <div className="px-5 pt-2 pb-5 lg:border-r lg:border-line">
          <dl>
            {BASE_ROWS.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 border-b border-line py-3">
                <dt className="text-[0.95rem] text-ink-soft">{r.label}</dt>
                <dd className="tnum font-mono font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2 flex w-full items-center justify-between gap-4 rounded-md bg-amber/10 px-3 py-3.5 text-left"
          >
            <span>
              <span className="flex items-center gap-1.5 font-archivo font-semibold">
                ISV
                <ChevronDown
                  className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </span>
              <span className="block text-xs text-ink-soft">
                <span className="tnum">21%</span> do custo total. Cobrado à chegada.
              </span>
            </span>
            <span className="tnum font-mono text-lg font-semibold text-amber">6 210 €</span>
          </button>

          {open && (
            <div className="mt-0.5 rounded-md bg-surface p-3">
              <dl>
                {ISV_ROWS.map((r) => (
                  <div key={r.label} className="flex justify-between gap-3 py-1.5 text-sm">
                    <dt className="text-ink-soft">{r.label}</dt>
                    <dd className={`tnum font-mono ${r.good ? "text-good" : "text-ink"}`}>{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-steel">
                Tabela do ISV de 2026, componente cilindrada + componente ambiental, com redução por
                anos de uso. Estimativa — quem fixa o valor é a Alfândega.
              </p>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-4 border-t-2 border-line-strong pt-4">
            <span className="font-archivo font-semibold">Custo final em Portugal</span>
            <span className="tnum font-archivo text-2xl font-bold">29 159 €</span>
          </div>
        </div>

        {/* Comparação */}
        <div className="flex flex-col gap-4 bg-surface p-5">
          <Bar label="Custo final importado" value="29 159 €" width="84%" tone="petrol" />
          <Bar label="Mercado português" value="34 900 €" width="100%" tone="steel" />

          <div className="rounded-md bg-good-soft p-4">
            <p className="text-xs font-semibold tracking-wider text-good uppercase">
              Poupança estimada
            </p>
            <p className="tnum font-archivo text-3xl leading-tight font-bold text-good">5 741 €</p>
            <p className="mt-1 text-sm text-ink-soft">
              contra a mediana de <span className="tnum">41</span> anúncios PT do mesmo modelo e ano.
            </p>
          </div>

          <p className="text-sm leading-relaxed text-steel">
            Fazemos esta conta a <span className="tnum">27 000</span> anúncios, todos os dias, antes
            de te mostrarmos qualquer carro.
          </p>
        </div>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: string;
  width: string;
  tone: "petrol" | "steel";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className={`tnum font-mono font-semibold ${tone === "petrol" ? "text-ink" : "text-ink-soft"}`}>
          {value}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-xs bg-line">
        <div
          className={`h-full ${tone === "petrol" ? "bg-petrol" : "bg-line-strong"}`}
          style={{ width }}
        />
      </div>
    </div>
  );
}
