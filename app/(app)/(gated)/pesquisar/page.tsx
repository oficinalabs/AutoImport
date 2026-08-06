import { SearchView } from "@/components/search-view";
import { searchListings } from "@/lib/data";
import { type SearchParams, parseSearchFilters } from "./filters";

export default async function PesquisarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Os filtros correm todos no SERVIDOR. Corriam no cliente, sobre a janela que
  // a query mandava: pedir diesel procurava diesel dentro dos 60 melhores
  // negócios em euros, não na montra.
  const filters = parseSearchFilters(await searchParams);
  const resultados = await searchListings(filters);

  return <SearchView results={resultados} filters={filters} />;
}
