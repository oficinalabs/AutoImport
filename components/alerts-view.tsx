"use client";

import { CountryFlag } from "@/components/country-flag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_LIST } from "@/lib/countries";
import { createAlert, toggleAlert } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import type { Alert, CountryCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BellPlus, BellRing, X } from "lucide-react";
import { useState } from "react";

export function AlertsView({ initialAlerts }: { initialAlerts: Alert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [showForm, setShowForm] = useState(false);

  // Estado do formulário de novo alerta
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [countries, setCountries] = useState<CountryCode[]>([]);

  function toggleCountry(code: CountryCode) {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function onToggle(id: string) {
    let next = false;
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        next = !a.active;
        return { ...a, active: next };
      }),
    );
    await toggleAlert(id, next); // optimistic — stub até haver backend
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !criteria.trim()) return;
    const summary = [criteria.trim(), maxPrice && `< ${formatEuro(Number(maxPrice))}`]
      .filter(Boolean)
      .join(" · ");
    const draft = {
      name: name.trim(),
      criteria: summary,
      countries,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    };
    setAlerts((prev) => [
      {
        id: `local-${Date.now()}`,
        name: draft.name,
        criteria: draft.criteria,
        countries: draft.countries,
        active: true,
        matchCount: 0,
      },
      ...prev,
    ]);
    setName("");
    setCriteria("");
    setMaxPrice("");
    setCountries([]);
    setShowForm(false);
    await createAlert(draft); // stub — persiste quando o backend ligar
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alertas</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Avisamos-te por email quando aparece um carro que bate os teus critérios.
          </p>
        </div>
        <Button variant="accent" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          {showForm ? <X className="size-4" /> : <BellPlus className="size-4" />}
          {showForm ? "Fechar" : "Novo alerta"}
        </Button>
      </div>

      {/* Formulário de novo alerta */}
      {showForm && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="alert-name" className="text-sm font-medium">
                Nome do alerta
              </label>
              <Input
                id="alert-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: BMW Série 3 diesel"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="alert-criteria" className="text-sm font-medium">
                Marca / modelo / critérios
              </label>
              <Input
                id="alert-criteria"
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                placeholder="Ex.: BMW 320d · > 2021 · < 80 000 km"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="alert-price" className="text-sm font-medium">
                Preço final máximo (€)
              </label>
              <Input
                id="alert-price"
                type="number"
                min="0"
                step="500"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Ex.: 35000"
              />
            </div>
          </div>

          <div>
            <span className="text-sm font-medium">Países</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {COUNTRY_LIST.map((c) => {
                const active = countries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCountry(c.code)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-petrol bg-petrol text-white"
                        : "border-line-strong text-ink-soft hover:text-ink",
                    )}
                  >
                    <span aria-hidden>{c.flag}</span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-xs text-ink-soft">
              Guardado localmente por agora — a persistência e o matching chegam com o backend.
            </p>
            <Button type="submit" variant="accent">
              Criar alerta
            </Button>
          </div>
        </form>
      )}

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-surface p-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BellRing className={cn("size-4", a.active ? "text-steel" : "text-ink-soft/50")} />
                <h2 className="font-semibold">{a.name}</h2>
                {a.matchCount > 0 && (
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">
                    {a.matchCount} matches
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{a.criteria}</p>
              {a.countries.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
                  {a.countries.map((c) => (
                    <CountryFlag key={c} code={c} showName={false} />
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onToggle(a.id)}
              role="switch"
              aria-checked={a.active}
              aria-label={`Alerta ${a.name} ${a.active ? "ativo" : "inativo"}`}
              className="flex items-center gap-2 text-sm"
            >
              <span className="text-ink-soft">{a.active ? "Ativo" : "Inativo"}</span>
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  a.active ? "bg-good" : "bg-line-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white transition-all",
                    a.active ? "left-[18px]" : "left-0.5",
                  )}
                />
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
