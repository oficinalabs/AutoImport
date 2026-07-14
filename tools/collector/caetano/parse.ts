// caetano/parse.ts — extração dos dados de uma resposta da API `search/v2` da Caetano.
//
// PADRÃO-MOLDE: autohero (a fonte é a API JSON, não HTML SSR). Cada resposta é
//   { count, data: { searchResult[] }, pagination: { maxPage, totalResults, ... } }
// com o array de viaturas completo (ver schema.ts para o mapeamento). Ver http.ts para o porquê
// da API e research/caetano-investigacao.md para as probes.
//
// FILTRO DE ALVO: a pesquisa de usados devolve TAMBÉM ~28% de MOTAS e ~1% de viaturas NOVAS
// (confirmado ao paginar até ao fim). Como o alvo são CARROS USADOS, mantemos só
// `vehicleType='CAR'` E `condition='Usado'` (que inclui os 'Semi-Novo'). O filtro é do lado do
// cliente porque a API não expõe um filtro simples por vehicleType num GET puro — e o volume é
// pequeno (~3,2k viaturas totais → ~13 páginas de 250), pelo que paginar tudo e filtrar é robusto.

import { normalizeVehicle, type CaetanoRecord } from './schema.ts';

// Resultado do parse de uma resposta da API.
export interface ParsedSearch {
  listings: CaetanoRecord[];
  total: number | null;
  rawTotal: number | null;
  maxPage: number | null;
  raw?: number;
}

// Tamanho de página da API. Probes: aceita >=500; 250 é um compromisso educado (≈13 páginas p/ o
// catálogo inteiro) e mantém as respostas com tamanho razoável.
export const PAGE_SIZE = 250;

// Ordenação por recência (best-effort): a API tem `sort=lastVehicleUpdateTime`. ⚠️ NÃO é
// perfeitamente monotónica (o `updateTime` é o instante de SYNC do feed, não a data de publicação),
// mas surfa as viaturas atualizadas mais recentemente — útil como sinal no watch. Para o batch,
// paginamos na ordem DEFAULT (estável) + dedupe global, que é mais fiável para cobertura completa.
export const SORT_RECENTE = 'lastVehicleUpdateTime';

// Mantém só carros usados (exclui motas e as poucas viaturas novas que se infiltram na pesquisa).
function isCarroUsado(v: Record<string, unknown>): boolean {
  return Boolean(v && v.vehicleType === 'CAR' && v.condition === 'Usado');
}

// Parse de uma resposta da API → { listings, total, rawTotal, maxPage }.
//   • listings : carros usados normalizados (já filtrados).
//   • rawTotal : `count` bruto da API (carros+motas+novos) — governa a PAGINAÇÃO.
//   • maxPage  : nº de páginas segundo a API (para o --full saber quando parar).
//   • total    : == rawTotal (compat. com a forma dos outros parses; o nº de CARROS é stats.records).
export function parseSearchResponse(json: unknown, { collectedAt = null }: { collectedAt?: string | null } = {}): ParsedSearch {
  const j = json as { count?: unknown; data?: { searchResult?: unknown }; pagination?: { maxPage?: unknown } } | null;
  const arr = j?.data?.searchResult;
  if (!Array.isArray(arr)) return { listings: [], total: null, rawTotal: null, maxPage: null };
  const listings = arr.filter(isCarroUsado).map((v) => normalizeVehicle(v, { collectedAt }));
  const rawTotal = typeof j?.count === 'number' ? j.count : null;
  const maxPage = typeof j?.pagination?.maxPage === 'number' ? j.pagination.maxPage : null;
  return { listings, total: rawTotal, rawTotal, maxPage, raw: arr.length };
}

// Chave de dedupe / identidade estável: o VIN (também é o que entra no detail_url). Fallback: URL.
export function recordId(rec: CaetanoRecord): string | null {
  return rec.id || rec.vin || rec.detail_url || null;
}
