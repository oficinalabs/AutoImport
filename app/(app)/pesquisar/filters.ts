/**
 * As nove chaves da pesquisa no URL — o URL é a fonte de verdade, e isto é a
 * fronteira onde o texto que qualquer pessoa pode escrever na barra de endereço
 * vira `SearchFilters`.
 *
 * Convenção (a que já valia com `pais`, `oportunidades` e `ordenar`): **chave em
 * português, valor no domínio** — o mesmo valor que `lib/types.ts` usa, para não
 * haver um dicionário a manter entre o URL e a BD.
 *
 *   ?texto=golf&pais=DE,FR&oportunidades=1&ano=2021&km=100000
 *   &preco=30000&combustivel=diesel&caixa=manual&ordenar=savingsPct
 *
 * **Um valor inválido é ignorado, nunca rebenta a página nem vira filtro.** Um
 * `?ano=abc` ou `?pais=ZZ` tem de dar a montra, não um 500 — o URL é público e
 * partilhável, e ninguém escreve links à mão sem se enganar.
 *
 * Vive à parte do `page.tsx` por uma razão prática: assim testa-se sem Next e
 * sem base de dados (ver tests/app/pesquisar-filtros.test.ts).
 */
import type { SearchFilters } from "@/lib/data";
import type { CountryCode, FuelType, Transmission } from "@/lib/types";

/** O que o Next entrega em `searchParams` — repetir a chave dá um array. */
export type SearchParams = Record<string, string | string[] | undefined>;

type Sort = NonNullable<SearchFilters["sort"]>;

const COUNTRIES: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
const FUELS: FuelType[] = ["gasolina", "diesel", "híbrido", "phev", "elétrico"];
const GEARBOXES: Transmission[] = ["manual", "automática"];
const SORTS: Sort[] = ["savings", "savingsPct", "recent", "price"];

/** `?pais=DE&pais=FR` — o Next dá array; fica a primeira, que é o que o link diz. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Ano, km e preço: inteiro positivo ou nada. `NaN` ("abc"), negativos, zero e
 * decimais caem fora — `Number("")` é 0 e `Number("1e9")` não é seguro como
 * filtro, por isso o teste é explícito em vez de um `parseInt` optimista.
 */
function inteiroPositivo(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function umDe<T extends string>(raw: string | undefined, validos: T[]): T | undefined {
  return validos.includes(raw as T) ? (raw as T) : undefined;
}

export function parseSearchFilters(params: SearchParams): SearchFilters {
  // Vários países num só parâmetro (`?pais=DE,FR`) em vez da chave repetida:
  // mantém compatível o `?pais=DE` que já existia e é mais fácil de ler no link.
  const paises = (first(params.pais)?.split(",") ?? []).filter((c): c is CountryCode =>
    COUNTRIES.includes(c as CountryCode),
  );
  const texto = first(params.texto)?.trim();

  return {
    query: texto || undefined,
    countries: paises.length ? paises : undefined,
    onlyOpportunities: first(params.oportunidades) === "1",
    minYear: inteiroPositivo(first(params.ano)),
    maxKm: inteiroPositivo(first(params.km)),
    maxPrice: inteiroPositivo(first(params.preco)),
    fuel: umDe(first(params.combustivel), FUELS),
    gearbox: umDe(first(params.caixa), GEARBOXES),
    sort: umDe(first(params.ordenar), SORTS),
  };
}

/**
 * O caminho inverso — o estado dos filtros de volta a URL. Vive aqui para as
 * duas pontas usarem as MESMAS chaves: quem escreve o URL é o cliente
 * (components/search-view.tsx), quem o lê é o servidor, e um desalinhamento
 * entre os dois seria um filtro que se perde ao recarregar.
 *
 * O que está no valor por omissão não vai para o URL (nem `ordenar=savings`, nem
 * um `oportunidades=0`): links curtos, e o que lá está é o que foi escolhido.
 */
export function searchFiltersToQuery(f: SearchFilters): string {
  const p = new URLSearchParams();
  if (f.query) p.set("texto", f.query);
  if (f.countries?.length) p.set("pais", f.countries.join(","));
  if (f.onlyOpportunities) p.set("oportunidades", "1");
  if (f.minYear) p.set("ano", String(f.minYear));
  if (f.maxKm) p.set("km", String(f.maxKm));
  if (f.maxPrice) p.set("preco", String(f.maxPrice));
  if (f.fuel) p.set("combustivel", f.fuel);
  if (f.gearbox) p.set("caixa", f.gearbox);
  if (f.sort && f.sort !== "savings") p.set("ordenar", f.sort);
  return p.toString();
}
