import { SearchView } from "@/components/search-view";
import { searchListings } from "@/lib/data";
import type { CountryCode } from "@/lib/types";

type Sort = "savings" | "recent" | "price";
const COUNTRIES: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
const SORTS: Sort[] = ["savings", "recent", "price"];

export default async function PesquisarPage({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; oportunidades?: string; ordenar?: string }>;
}) {
  const { pais, oportunidades, ordenar } = await searchParams;
  const listings = await searchListings();

  const initialCountry = COUNTRIES.includes(pais as CountryCode)
    ? (pais as CountryCode)
    : undefined;
  const initialOnlyOpps = oportunidades === "1";
  const initialSort = SORTS.includes(ordenar as Sort) ? (ordenar as Sort) : undefined;

  return (
    <SearchView
      listings={listings}
      initialCountry={initialCountry}
      initialOnlyOpps={initialOnlyOpps}
      initialSort={initialSort}
    />
  );
}
