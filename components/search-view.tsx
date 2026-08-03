"use client";

import { CarCard } from "@/components/car-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_LIST } from "@/lib/countries";
import type { SearchFilters, SearchPage } from "@/lib/data";
import type { CountryCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GitCompareArrows, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A vista da pesquisa. **Não filtra nada** — só desenha o que o servidor mandou e
 * escreve os filtros no URL, que é a fonte de verdade.
 *
 * Antes filtrava em memória as 60 linhas que o servidor devolvia sempre iguais,
 * o que dava zero resultados para tudo o que não estivesse no top-60 por poupança.
 * Agora cada mexida num filtro é uma navegação: o servidor volta a consultar a
 * base, o URL fica partilhável e o botão "voltar atrás" funciona de graça.
 */

/** Os filtros como aparecem no URL. A ordem é estável para o URL não dançar. */
function toQuery(f: SearchFilters): string {
  const p = new URLSearchParams();
  if (f.query) p.set("q", f.query);
  if (f.countries?.length) p.set("pais", f.countries.join(","));
  if (f.onlyOpportunities) p.set("oportunidades", "1");
  if (f.minYear) p.set("ano", String(f.minYear));
  if (f.maxKm) p.set("km", String(f.maxKm));
  if (f.maxPrice) p.set("preco", String(f.maxPrice));
  if (f.fuel) p.set("combustivel", f.fuel);
  if (f.gearbox) p.set("caixa", f.gearbox);
  // `percentagem` é o default do servidor — não suja o URL.
  if (f.sort && f.sort !== "percentagem") p.set("ordenar", f.sort);
  if (f.page && f.page > 1) p.set("pagina", String(f.page));
  return p.toString();
}

const AVANCADOS = ["minYear", "maxKm", "maxPrice", "fuel", "gearbox"] as const;

export function SearchView({ results, filters }: { results: SearchPage; filters: SearchFilters }) {
  const router = useRouter();
  const pathname = usePathname();

  // Estado local SÓ para o que não pode esperar por uma ida ao servidor: o texto
  // enquanto é escrito, e a seleção para comparar (que é UI, não filtro).
  const [query, setQuery] = useState(filters.query ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(AVANCADOS.some((k) => filters[k] !== undefined));

  /** O último `q` que nós próprios empurrámos. Sem isto, a resposta do servidor a
   *  uma tecla antiga podia sobrepor-se ao que a pessoa já escreveu a seguir. */
  const empurrado = useRef(filters.query ?? "");

  useEffect(() => {
    if (filters.query !== empurrado.current) {
      // Veio de fora (voltar atrás, link) — acompanhar.
      empurrado.current = filters.query ?? "";
      setQuery(filters.query ?? "");
    }
  }, [filters.query]);

  /** Os filtros mais recentes, para o `navegar` os ler sem se recriar a cada
   *  navegação. Não é micro-otimização: sem isto, o timer do texto guardava os
   *  filtros de quando a tecla foi carregada e desfazia um país escolhido
   *  entretanto. */
  const atuais = useRef(filters);
  atuais.current = filters;

  /** Muda filtros e navega. Qualquer mexida volta à página 1: continuar na 7
   *  depois de estreitar a pesquisa mostrava um vazio que parecia avaria. */
  const navegar = useCallback(
    (patch: Partial<SearchFilters>) => {
      const qs = toQuery({ ...atuais.current, ...patch, page: patch.page ?? 1 });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // O texto espera 350 ms para não fazer uma ida ao servidor por tecla.
  useEffect(() => {
    if (query === (atuais.current.query ?? "")) return;
    const t = setTimeout(() => {
      empurrado.current = query;
      navegar({ query: query || undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [query, navegar]);

  function toggleCountry(code: CountryCode) {
    const escolhidos = filters.countries ?? [];
    const next = escolhidos.includes(code)
      ? escolhidos.filter((c) => c !== code)
      : [...escolhidos, code];
    navegar({ countries: next.length ? next : undefined });
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 4 ? [...prev, id] : prev,
    );
  }

  const avancados = AVANCADOS.filter((k) => filters[k] !== undefined).length;
  const { items, total, page, pageSize, hasMore } = results;
  const primeiro = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const ultimo = (page - 1) * pageSize + items.length;

  const paginaHref = (n: number) => {
    const qs = toQuery({ ...filters, page: n });
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pesquisar</h1>
          <p className="mt-1 text-sm text-ink-soft" data-testid="total">
            <span className="tnum">{total.toLocaleString("pt-PT")}</span>{" "}
            {total === 1 ? "anúncio" : "anúncios"}
            {total > pageSize && (
              <>
                {" · "}
                <span className="tnum">
                  {primeiro}–{ultimo}
                </span>
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Marca ou modelo (ex.: Golf, BMW…)"
            className="max-w-xs"
            data-testid="pesquisa"
          />
          <label
            className={cn(
              "flex h-10 cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-sm font-medium transition-colors",
              filters.onlyOpportunities
                ? "border-good bg-good-soft text-good"
                : "border-line-strong text-ink-soft hover:text-ink",
            )}
          >
            <input
              type="checkbox"
              checked={filters.onlyOpportunities ?? false}
              onChange={(e) => navegar({ onlyOpportunities: e.target.checked || undefined })}
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
              value={filters.sort ?? "percentagem"}
              onChange={(e) => navegar({ sort: e.target.value as SearchFilters["sort"] })}
              className="h-10 rounded-[6px] border border-line-strong bg-surface px-3 text-sm"
              aria-label="Ordenar"
            >
              <option value="percentagem">Melhor negócio (%)</option>
              <option value="savings">Maior poupança (€)</option>
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
              value={filters.minYear ? String(filters.minYear) : ""}
              onChange={(v) => navegar({ minYear: v ? Number(v) : undefined })}
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
              value={filters.maxKm ? String(filters.maxKm) : ""}
              onChange={(v) => navegar({ maxKm: v ? Number(v) : undefined })}
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
              value={filters.maxPrice ? String(filters.maxPrice) : ""}
              onChange={(v) => navegar({ maxPrice: v ? Number(v) : undefined })}
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
              value={filters.fuel ?? ""}
              onChange={(v) => navegar({ fuel: (v || undefined) as SearchFilters["fuel"] })}
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
              value={filters.gearbox ?? ""}
              onChange={(v) => navegar({ gearbox: (v || undefined) as SearchFilters["gearbox"] })}
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
                  navegar({
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
            const active = filters.countries?.includes(c.code) ?? false;
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
          {filters.countries?.length ? (
            <button
              type="button"
              onClick={() => navegar({ countries: undefined })}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm text-ink-soft hover:text-ink"
            >
              <X className="size-3.5" /> limpar
            </button>
          ) : null}
        </div>
      </div>

      {/* Resultados */}
      {items.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line-strong py-16 text-center text-sm text-ink-soft">
          Nenhum anúncio com estes filtros.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((l) => (
            <div key={l.id} className="relative" data-testid="resultado">
              {/* z-20: acima do badge de veredito do cartão, que ocupa o mesmo canto */}
              <label className="absolute left-2 top-2 z-20 flex cursor-pointer items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
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

      {/* Paginação */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-3">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={paginaHref(page - 1)} scroll>
              Anterior
            </Link>
          </Button>
          <span className="tnum text-sm text-ink-soft">
            Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Button asChild variant="outline" size="sm" disabled={!hasMore}>
            <Link href={paginaHref(page + 1)} scroll>
              Seguinte
            </Link>
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
