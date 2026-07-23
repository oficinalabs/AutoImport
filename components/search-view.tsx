"use client";

import { CarCard } from "@/components/car-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_LIST } from "@/lib/countries";
import type { CountryCode, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GitCompareArrows, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Sort = "savings" | "recent" | "price";

export function SearchView({
  listings,
  initialCountry,
  initialOnlyOpps = false,
  initialSort = "savings",
}: {
  listings: Listing[];
  initialCountry?: CountryCode;
  /** Pré-filtros vindos do URL — usados quando se salta de um KPI do painel. */
  initialOnlyOpps?: boolean;
  initialSort?: Sort;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [countries, setCountries] = useState<CountryCode[]>(initialCountry ? [initialCountry] : []);
  const [onlyOpps, setOnlyOpps] = useState(initialOnlyOpps);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [selected, setSelected] = useState<string[]>([]);

  // Filtros avançados ("Mais filtros")
  const [showMore, setShowMore] = useState(false);
  const [minYear, setMinYear] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [fuel, setFuel] = useState("");
  const [gearbox, setGearbox] = useState("");
  const advancedCount = [minYear, maxKm, maxPrice, fuel, gearbox].filter(Boolean).length;

  function clearAdvanced() {
    setMinYear("");
    setMaxKm("");
    setMaxPrice("");
    setFuel("");
    setGearbox("");
  }

  function toggleCountry(code: CountryCode) {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 4 ? [...prev, id] : prev,
    );
  }

  const results = useMemo(() => {
    let out = [...listings];
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((l) => l.title.toLowerCase().includes(q));
    }
    if (countries.length) out = out.filter((l) => countries.includes(l.country));
    if (onlyOpps) out = out.filter((l) => l.verdict === "compensa");
    if (minYear) out = out.filter((l) => l.year >= Number(minYear));
    if (maxKm) out = out.filter((l) => l.km <= Number(maxKm));
    if (maxPrice) out = out.filter((l) => l.cost.totalPt <= Number(maxPrice));
    if (fuel) out = out.filter((l) => l.model.fuel === fuel);
    if (gearbox) out = out.filter((l) => l.model.transmission === gearbox);
    out.sort((a, b) =>
      sort === "price"
        ? a.cost.totalPt - b.cost.totalPt
        : sort === "recent"
          ? b.seenAt.localeCompare(a.seenAt)
          : b.savings - a.savings,
    );
    return out;
  }, [listings, query, countries, onlyOpps, sort, minYear, maxKm, maxPrice, fuel, gearbox]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pesquisar</h1>
          <p className="mt-1 text-sm text-ink-soft">
            <span className="tnum">{results.length}</span> anúncios · custo final já com ISV
          </p>
        </div>
      </div>

      {/* Pesquisa + país */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Marca ou modelo (ex.: Golf, BMW…)"
            className="max-w-xs"
          />
          <label
            className={cn(
              "flex h-10 cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-sm font-medium transition-colors",
              onlyOpps
                ? "border-good bg-good-soft text-good"
                : "border-line-strong text-ink-soft hover:text-ink",
            )}
          >
            <input
              type="checkbox"
              checked={onlyOpps}
              onChange={(e) => setOnlyOpps(e.target.checked)}
              className="sr-only"
            />
            Só oportunidades
          </label>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-[6px] border px-3 text-sm transition-colors",
              showMore || advancedCount > 0
                ? "border-petrol text-ink"
                : "border-line-strong text-ink-soft hover:text-ink",
            )}
          >
            <SlidersHorizontal className="size-4" /> Mais filtros
            {advancedCount > 0 && (
              <span className="tnum flex size-5 items-center justify-center rounded-full bg-petrol text-[11px] font-semibold text-white">
                {advancedCount}
              </span>
            )}
          </button>
          <div className="ml-auto">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-10 rounded-[6px] border border-line-strong bg-surface px-3 text-sm"
              aria-label="Ordenar"
            >
              <option value="savings">Maior poupança</option>
              <option value="recent">Mais recentes</option>
              <option value="price">Preço mais baixo</option>
            </select>
          </div>
        </div>

        {/* Filtros avançados */}
        {showMore && (
          <div className="grid gap-3 rounded-[8px] border border-line bg-surface p-3 sm:grid-cols-3 lg:grid-cols-6">
            <Sel
              label="Ano mínimo"
              value={minYear}
              onChange={setMinYear}
              options={[
                ["", "Qualquer"],
                ["2020", "2020+"],
                ["2021", "2021+"],
                ["2022", "2022+"],
                ["2023", "2023+"],
                ["2024", "2024+"],
              ]}
            />
            <Sel
              label="Km máximos"
              value={maxKm}
              onChange={setMaxKm}
              options={[
                ["", "Qualquer"],
                ["30000", "até 30 000"],
                ["60000", "até 60 000"],
                ["100000", "até 100 000"],
                ["150000", "até 150 000"],
              ]}
            />
            <Sel
              label="Preço final máx."
              value={maxPrice}
              onChange={setMaxPrice}
              options={[
                ["", "Qualquer"],
                ["20000", "até 20 000 €"],
                ["30000", "até 30 000 €"],
                ["40000", "até 40 000 €"],
                ["50000", "até 50 000 €"],
              ]}
            />
            <Sel
              label="Combustível"
              value={fuel}
              onChange={setFuel}
              options={[
                ["", "Todos"],
                ["gasolina", "Gasolina"],
                ["diesel", "Diesel"],
                ["híbrido", "Híbrido"],
                ["phev", "PHEV"],
                ["elétrico", "Elétrico"],
              ]}
            />
            <Sel
              label="Caixa"
              value={gearbox}
              onChange={setGearbox}
              options={[
                ["", "Todas"],
                ["manual", "Manual"],
                ["automática", "Automática"],
              ]}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={clearAdvanced}
                disabled={advancedCount === 0}
                className="flex h-10 w-full items-center justify-center gap-1 rounded-[6px] border border-line-strong text-sm text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
              >
                <X className="size-3.5" /> Limpar
              </button>
            </div>
          </div>
        )}

        {/* Chips de país */}
        <div className="flex flex-wrap gap-2">
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
          {countries.length > 0 && (
            <button
              type="button"
              onClick={() => setCountries([])}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm text-ink-soft hover:text-ink"
            >
              <X className="size-3.5" /> limpar
            </button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {results.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line-strong py-16 text-center text-sm text-ink-soft">
          Nenhum anúncio com estes filtros.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((l) => (
            <div key={l.id} className="relative">
              <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
                <input
                  type="checkbox"
                  checked={selected.includes(l.id)}
                  onChange={() => toggleSelect(l.id)}
                  className="accent-petrol"
                />
                Comparar
              </label>
              <CarCard listing={l} />
            </div>
          ))}
        </div>
      )}

      {/* Barra de comparação */}
      {selected.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border border-line-strong bg-surface px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">
            <span className="tnum">{selected.length}</span> selecionado(s)
          </span>
          <Button
            variant="accent"
            size="sm"
            disabled={selected.length < 2}
            onClick={() => router.push(`/comparar?ids=${selected.join(",")}`)}
          >
            <GitCompareArrows className="size-4" /> Comparar
          </Button>
          <button
            type="button"
            onClick={() => setSelected([])}
            aria-label="Limpar seleção"
            className="text-ink-soft hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Sel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-soft">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[6px] border border-line-strong bg-surface px-2.5 text-sm text-ink"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
