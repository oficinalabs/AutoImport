import { SearchView } from "@/components/search-view";
import { searchListings } from "@/lib/data";
import type { CountryCode } from "@/lib/types";

export default async function PesquisarPage({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string }>;
}) {
  const { pais } = await searchParams;
  const listings = await searchListings();
  const initialCountry = (["DE", "FR", "BE", "NL", "ES"] as CountryCode[]).includes(
    pais as CountryCode,
  )
    ? (pais as CountryCode)
    : undefined;

  return <SearchView listings={listings} initialCountry={initialCountry} />;
}
