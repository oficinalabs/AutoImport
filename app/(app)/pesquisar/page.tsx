import { SearchView } from "@/components/search-view";
import { type SearchFilters, type SearchSort, searchListings } from "@/lib/data";
import type { CountryCode, FuelType, Transmission } from "@/lib/types";

/**
 * O URL é a ÚNICA fonte de verdade dos filtros: é ele que vai para o servidor,
 * e é dele que o `SearchView` se pinta. Antes esta página lia três params, usava-os
 * só como estado inicial de um componente client, e chamava `searchListings()`
 * **sem argumentos** — o servidor devolvia sempre os mesmos 60 anúncios e todos
 * os filtros corriam em memória sobre eles. Procurar "Golf" dava zero resultados
 * com 900 Golfs na montra.
 *
 * Tudo o que entra é validado contra uma allowlist ou coagido a número: os
 * valores vão para SQL e um param inventado não pode rebentar a query nem chegar
 * ao cliente como erro (ver CLAUDE.md — a UI nunca mostra detalhe de erro).
 */
const COUNTRIES: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
const SORTS: SearchSort[] = ["percentagem", "savings", "recent", "price"];
const FUELS: FuelType[] = ["gasolina", "diesel", "híbrido", "phev", "elétrico"];
const GEARBOXES: Transmission[] = ["manual", "automática"];

/** Número positivo, ou undefined. Aceita só dígitos — `Number("12abc")` é NaN,
 *  mas `Number("")` é 0 e `Number(" 1 ")` é 1, e nenhum dos dois é um filtro. */
function num(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

function one<T extends string>(value: string | undefined, allowed: T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** `pais=DE,ES` → ["DE","ES"]. Multi-seleção: a UI sempre permitiu vários países,
 *  o URL é que só levava um. Compatível com os links antigos de país único. */
function countries(value: string | undefined): CountryCode[] | undefined {
  const list = (value ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is CountryCode => COUNTRIES.includes(c as CountryCode));
  return list.length ? list : undefined;
}

export type SearchParams = {
  q?: string;
  pais?: string;
  oportunidades?: string;
  ordenar?: string;
  ano?: string;
  km?: string;
  preco?: string;
  combustivel?: string;
  caixa?: string;
  pagina?: string;
};

function toFilters(sp: SearchParams): SearchFilters {
  return {
    // Teto de 80 caracteres: o resto é ruído e vai para 6 `ilike` por token.
    query: sp.q?.trim().slice(0, 80) || undefined,
    countries: countries(sp.pais),
    onlyOpportunities: sp.oportunidades === "1",
    maxPrice: num(sp.preco),
    minYear: num(sp.ano),
    maxKm: num(sp.km),
    fuel: one(sp.combustivel, FUELS),
    gearbox: one(sp.caixa, GEARBOXES),
    sort: one(sp.ordenar, SORTS) ?? "percentagem",
    page: num(sp.pagina) ?? 1,
  };
}

export default async function PesquisarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = toFilters(await searchParams);
  const results = await searchListings(filters);
  return <SearchView results={results} filters={filters} />;
}
