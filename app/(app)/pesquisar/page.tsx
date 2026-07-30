import { SearchView } from "@/components/search-view";
import { searchListings } from "@/lib/data";
import { type SearchParams, parseSearchFilters } from "./filters";

export default async function PesquisarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Os nove filtros correm no SERVIDOR. Corriam no cliente, sobre a janela de 60
  // que a query mandava: pedir diesel procurava diesel dentro dos 60 melhores
  // negócios em euros, não na montra.
  const filters = parseSearchFilters(await searchParams);
  const { listings, total } = await searchListings(filters);

  return <SearchView listings={listings} total={total} filters={filters} />;
}
