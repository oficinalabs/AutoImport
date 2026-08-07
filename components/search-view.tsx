"use client";

import { DEFAULT_SORT, searchFiltersToQuery } from "@/app/(app)/(gated)/pesquisar/filters";
import { CarCard } from "@/components/car-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_LIST } from "@/lib/countries";
import type { SearchFilters, SearchResults } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import type { CountryCode, FuelType, Listing, Transmission } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GitCompareArrows, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Sort = NonNullable<SearchFilters["sort"]>;

/**
 * Quanto tempo o campo de texto espera pela tecla seguinte antes de escrever no
 * URL. 400 ms é a pausa entre palavras de quem escreve depressa: quem escreve
 * "golf gti" de seguida faz uma navegação, não nove.
 */
const DEBOUNCE_TEXTO_MS = 400;

export function SearchView({
  results,
  filters,
}: {
  /** A página que o servidor mandou, já filtrada e ordenada, com o total real. */
  results: SearchResults;
  /** O que o URL diz. É a fonte de verdade; os controlos são o espelho dele. */
  filters: SearchFilters;
}) {
  const { listings, total, page, pageSize, hasMore } = results;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);

  // Espelho local do URL: os controlos respondem à primeira, sem esperar pela
  // ida ao servidor (a página é force-dynamic — cada filtro é uma query nova).
  // Quem manda continua a ser o URL: quando uma navegação assenta — incluindo o
  // voltar do browser ou um link do painel — o espelho é reposto.
  const [f, setF] = useState(filters);
  const [texto, setTexto] = useState(filters.query ?? "");
  const urlAtual = searchFiltersToQuery(filters);
  const [urlEspelhado, setUrlEspelhado] = useState(urlAtual);
  if (urlEspelhado !== urlAtual) {
    setUrlEspelhado(urlAtual);
    setF(filters);
    // O texto cru só se repõe se o URL discordar do que já lá está: o servidor
    // devolve-o aparado, e repor às cegas comia o espaço a meio de "golf gti".
    if ((filters.query ?? "") !== texto.trim()) setTexto(filters.query ?? "");
  }

  const timerTexto = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerTexto.current), []);

  /**
   * Escreve os filtros no URL. `replace` para o texto — não vale a pena encher o
   * histórico com meia palavra; `push` para os cliques, e assim o voltar desfaz
   * um filtro em vez de sair da pesquisa. `scroll: false` porque mudar um filtro
   * não é mudar de página: a grelha fica onde está.
   */
  function navegar(next: SearchFilters, replace = false) {
    const qs = searchFiltersToQuery(next);
    const url = qs ? `/pesquisar?${qs}` : "/pesquisar";
    startTransition(() => {
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    });
  }

  /** O URL de outra página, com os filtros que lá estão. */
  function hrefDaPagina(n: number) {
    const qs = searchFiltersToQuery({ ...f, page: n });
    return qs ? `/pesquisar?${qs}` : "/pesquisar";
  }

  /** Um controlo mexeu: espelho já, URL a seguir. */
  function aplicar(patch: Partial<SearchFilters>) {
    clearTimeout(timerTexto.current);
    // Volta à página 1: continuar na 7 depois de estreitar a pesquisa mostrava
    // um vazio que parecia avaria.
    const next = { ...f, ...patch, page: undefined };
    setF(next);
    navegar(next);
  }

  /**
   * O texto é a exceção: agora quem filtra é o servidor, e escrever no URL é
   * navegar. Sem espera, "golf" eram quatro navegações e quatro varreduras da
   * montra. O campo responde à tecla; o URL só 400 ms depois da última.
   */
  function escreverTexto(value: string) {
    setTexto(value);
    const next = { ...f, query: value.trim() || undefined, page: undefined };
    setF(next);
    clearTimeout(timerTexto.current);
    timerTexto.current = setTimeout(() => navegar(next, true), DEBOUNCE_TEXTO_MS);
  }

  // Filtros avançados ("Mais filtros") — abertos à partida se o link já os trouxer,
  // senão um `?km=60000` partilhado filtrava com os controlos escondidos.
  const avancados = [f.minYear, f.maxKm, f.maxPrice, f.fuel, f.gearbox].filter(Boolean).length;
  const [showMore, setShowMore] = useState(avancados > 0);

  function toggleCountry(code: CountryCode) {
    const atuais = f.countries ?? [];
    const next = atuais.includes(code) ? atuais.filter((c) => c !== code) : [...atuais, code];
    aplicar({ countries: next.length ? next : undefined });
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 4 ? [...prev, id] : prev,
    );
  }

  const countries = f.countries ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pesquisar</h1>
          {/* O que se vê é uma janela sobre a montra — dizer só "60 anúncios" era
              verdade sobre o que chegou e mentira sobre o que existe. */}
          <p className="mt-1 text-sm text-ink-soft" data-testid="total">
            {listings.length < total ? (
              <>
                <span className="tnum">
                  {formatNumber((page - 1) * pageSize + 1)}–
                  {formatNumber((page - 1) * pageSize + listings.length)}
                </span>{" "}
                de <span className="tnum">{formatNumber(total)}</span> anúncios
              </>
            ) : (
              <>
                <span className="tnum">{formatNumber(total)}</span> anúncios
              </>
            )}{" "}
            · custo final já com ISV
          </p>
        </div>
      </div>

      {/* Pesquisa + país */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={texto}
            onChange={(e) => escreverTexto(e.target.value)}
            placeholder="Marca ou modelo (ex.: Golf, BMW…)"
            data-testid="pesquisa"
            className="max-w-xs"
          />
          <label
            className={cn(
              "flex h-10 cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-sm font-medium transition-colors",
              f.onlyOpportunities
                ? "border-good bg-good-soft text-good"
                : "border-line-strong text-ink-soft hover:text-ink",
            )}
          >
            <input
              type="checkbox"
              checked={Boolean(f.onlyOpportunities)}
              onChange={(e) => aplicar({ onlyOpportunities: e.target.checked })}
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
              showMore || avancados > 0
                ? "border-petrol text-ink"
                : "border-line-strong text-ink-soft hover:text-ink",
            )}
          >
            <SlidersHorizontal className="size-4" /> Mais filtros
            {avancados > 0 && (
              <span className="tnum flex size-5 items-center justify-center rounded-full bg-petrol text-[11px] font-semibold text-white">
                {avancados}
              </span>
            )}
          </button>
          <div className="ml-auto">
            <select
              value={f.sort ?? DEFAULT_SORT}
              onChange={(e) => aplicar({ sort: e.target.value as Sort })}
              className="h-10 rounded-[6px] border border-line-strong bg-surface px-3 text-sm"
              aria-label="Ordenar"
            >
              <option value="savings">Maior poupança</option>
              <option value="savingsPct">Maior poupança (%)</option>
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
              value={f.minYear ? String(f.minYear) : ""}
              onChange={(v) => aplicar({ minYear: v ? Number(v) : undefined })}
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
              value={f.maxKm ? String(f.maxKm) : ""}
              onChange={(v) => aplicar({ maxKm: v ? Number(v) : undefined })}
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
              value={f.maxPrice ? String(f.maxPrice) : ""}
              onChange={(v) => aplicar({ maxPrice: v ? Number(v) : undefined })}
              options={[
                ["", "Qualquer"],
                ["20000", "até 20 000 €"],
                ["30000", "até 30 000 €"],
                ["40000", "até 40 000 €"],
                ["50000", "até 50 000 €"],
              ]}
            />
            <Sel<FuelType>
              label="Combustível"
              value={f.fuel ?? ""}
              onChange={(v) => aplicar({ fuel: v || undefined })}
              options={[
                ["", "Todos"],
                ["gasolina", "Gasolina"],
                ["diesel", "Diesel"],
                ["híbrido", "Híbrido"],
                ["phev", "PHEV"],
                ["elétrico", "Elétrico"],
              ]}
            />
            <Sel<Transmission>
              label="Caixa"
              value={f.gearbox ?? ""}
              onChange={(v) => aplicar({ gearbox: v || undefined })}
              options={[
                ["", "Todas"],
                ["manual", "Manual"],
                ["automática", "Automática"],
              ]}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={() =>
                  aplicar({
                    minYear: undefined,
                    maxKm: undefined,
                    maxPrice: undefined,
                    fuel: undefined,
                    gearbox: undefined,
                  })
                }
                disabled={avancados === 0}
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
              onClick={() => aplicar({ countries: undefined })}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm text-ink-soft hover:text-ink"
            >
              <X className="size-3.5" /> limpar
            </button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {listings.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line-strong py-16 text-center text-sm text-ink-soft">
          Nenhum anúncio com estes filtros.
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
            // Enquanto o servidor refaz a pesquisa, a grelha ainda mostra a
            // anterior — sem isto parecia que o filtro não fez nada.
            pending && "opacity-50",
          )}
        >
          {listings.map((l) => (
            <div key={l.id} className="relative" data-testid="resultado">
              {/* top-9, não top-2: o badge de veredito do cartão ocupa o mesmo
                  canto, e a etiqueta tapava-o em todas as larguras. */}
              <label className="absolute left-2 top-9 z-20 flex cursor-pointer items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
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

      {/* Paginação. `Link` (e não `router.replace`) de propósito: mudar de página
          É navegar, e o voltar do browser tem de voltar à página anterior — ao
          contrário de mexer num filtro, que só substitui o URL. */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-3">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={hrefDaPagina(page - 1)}>Anterior</Link>
          </Button>
          <span className="tnum text-sm text-ink-soft">
            Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Button asChild variant="outline" size="sm" disabled={!hasMore}>
            <Link href={hrefDaPagina(page + 1)}>Seguinte</Link>
          </Button>
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

function Sel<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  onChange: (value: T | "") => void;
  options: [T | "", string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-soft">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
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
