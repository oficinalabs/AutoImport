import type { Country, CountryCode } from "./types";

/** Países de origem suportados no MVP (ver research/paises-viaveis-importacao-2026.md). */
export const COUNTRIES: Record<CountryCode, Country> = {
  DE: { code: "DE", name: "Alemanha", flag: "🇩🇪" },
  FR: { code: "FR", name: "França", flag: "🇫🇷" },
  BE: { code: "BE", name: "Bélgica", flag: "🇧🇪" },
  NL: { code: "NL", name: "Holanda", flag: "🇳🇱" },
  ES: { code: "ES", name: "Espanha", flag: "🇪🇸" },
};

export const COUNTRY_LIST: Country[] = Object.values(COUNTRIES);

export function country(code: CountryCode): Country {
  return COUNTRIES[code];
}
