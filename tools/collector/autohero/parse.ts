// autohero/parse.ts — construção do pedido e extração dos dados da API GraphQL do autohero.com.
//
// PADRÃO-MOLDE: como o aramisauto/flexicar, a fonte é um objeto de estado rico — mas aqui vem
// DIRETO da API JSON (não do HTML SSR), porque só a API pagina para lá dos ~30 primeiros. Cada
// resposta é `{ total, data[] }` com o array de anúncios completo. Ver http.ts para o porquê da API.
//
// SORT: a API só aceita alguns valores (probes): `newest_eligible` (recência — ordena por data de
// elegibilidade/publicação, DETERMINÍSTICO) e `most_popular` (popularidade — também estável por
// sessão). Usamos `newest_eligible` por default: dá paginação por offset estável (cobertura completa
// sem lacunas) E serve de sinal de recência ao watch.

import { normalizeAd, type AutoheroRecord } from './schema.ts';
import { MARKET } from './http.ts';

export const LIMIT_MAX = 100;                     // teto do `limit` da API (probes: >100 → erro)
export const SORT_RECENTE = 'newest_eligible';    // recência determinística (default)
export const SORT_POPULAR = 'most_popular';       // alternativa estável (popularidade)

// Objeto `variables` do pedido GraphQL. Forma mínima do que a API aceita.
export interface SearchVariables {
  search: {
    filter: { field: string; op: string; value: string };
    sort: string;
    limit: number;
    offset: number;
    properties: { includeProspective: boolean };
  };
}

// Resposta desembrulhada da API (`searchAdV9AdsV2`): `{ total, data[] }`. Payload externo
// dinâmico → `data` fica `unknown` (narrowing por Array.isArray no consumo).
export interface AdsResponse {
  total?: unknown;
  data: unknown;
}

// Resultado do parse de uma resposta da API.
export interface ParsedAds {
  listings: AutoheroRecord[];
  total: number | null;
}

// Constrói o objeto `variables` do pedido para um dado offset/limit/sort.
// - filter: countryCode = mercado (DE). `includeProspective` inclui os "coming soon".
export function buildVariables({ offset = 0, limit = LIMIT_MAX, sort = SORT_RECENTE }: { offset?: number; limit?: number; sort?: string } = {}): SearchVariables {
  return {
    search: {
      filter: { field: 'countryCode', op: 'eq', value: MARKET.country },
      sort,
      limit: Math.min(limit, LIMIT_MAX),
      offset,
      properties: { includeProspective: true },
    },
  };
}

// Parse de uma resposta da API → { listings, total }. `ads` é o objeto `{ total, data[] }` já
// desembrulhado pelo http.postGraphql.
export function parseAdsResponse(ads: AdsResponse | null, { collectedAt = null }: { collectedAt?: string | null } = {}): ParsedAds {
  if (!ads || !Array.isArray(ads.data)) return { listings: [], total: null };
  return {
    listings: ads.data.map((a) => normalizeAd(a, { collectedAt })),
    total: typeof ads.total === 'number' ? ads.total : null,
  };
}

// Chave de dedupe / identidade estável: o `id` (UUID do anúncio). Fallback: stockNumber, detail_url.
export function recordId(rec: AutoheroRecord): string | null {
  return rec.id || rec.stock_number || rec.detail_url || null;
}
