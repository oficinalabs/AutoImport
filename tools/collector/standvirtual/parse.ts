// standvirtual/parse.ts — extrai os anúncios de uma página de listagem do standvirtual.com.
//
// FONTE: a página é Next.js e embute o estado GraphQL (urql) no <script id="__NEXT_DATA__">
// (SSR). Os anúncios ficam em `props.pageProps.urqlState[<hash>].data` (STRING JSON escapada);
// a entrada útil é a que contém `advertSearch`. Dentro dela:
//   • advertSearch.totalCount        → total de resultados da query
//   • advertSearch.pageInfo          → { pageSize (32), currentOffset }
//   • advertSearch.edges[].node      → o anúncio (Advert) completo
// Cada `node` traz id, title, createdAt (RECÊNCIA REAL), url, price, location (cidade/região),
// seller (__typename = PrivateSeller/ProfessionalSeller → particular/stand), sellerLink (nome
// do stand), thumbnail (olxcdn) e um array `parameters[]` (make/model/version/fuel_type/
// gearbox/mileage/engine_capacity/engine_power/first_registration_year). Ver
// research/standvirtual-investigacao.md.
//
// ⚠️ NÃO usamos a API GraphQL (/api/, proibida pelo robots) — só este SSR da listagem.

import { normalizeNode, type StandvirtualRecord } from './schema.ts';

// Forma mínima do `advertSearch` (payload externo dinâmico → narrowing).
interface AdvertSearch {
  edges: { node: unknown }[];
  totalCount?: unknown;
  pageInfo?: { pageSize?: unknown; currentOffset?: unknown };
}

// Resultado do parse de uma página de listagem.
export interface ParsedPage {
  listings: StandvirtualRecord[];
  total: number | null;
  pageSize: number | null;
  offset: number | null;
}

// Extrai e faz parse do objeto __NEXT_DATA__. O <script> tem atributos extra (nonce, crossorigin),
// por isso o regex aceita `[^>]*` antes do `>`. Devolve null se não existir/não parsear.
export function extractNextData(html: string): unknown {
  const m = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Localiza e desembrulha o `advertSearch` dentro do urqlState (a entrada é uma string JSON).
export function extractAdvertSearch(html: string): AdvertSearch | null {
  const data = extractNextData(html) as { props?: { pageProps?: { urqlState?: unknown } } } | null;
  const urql = data?.props?.pageProps?.urqlState;
  if (!urql || typeof urql !== 'object') return null;
  for (const k of Object.keys(urql)) {
    const raw = (urql as Record<string, { data?: unknown }>)[k]?.data;
    if (typeof raw !== 'string' || !raw.includes('advertSearch')) continue;
    try {
      const as = (JSON.parse(raw) as { advertSearch?: AdvertSearch }).advertSearch;
      if (as && Array.isArray(as.edges)) return as;
    } catch { /* tenta a próxima entrada */ }
  }
  return null;
}

// Parse de uma página → { listings, total, pageSize, offset }.
export function parseListingPage(html: string, { collectedAt = null }: { collectedAt?: string | null } = {}): ParsedPage {
  const as = extractAdvertSearch(html);
  if (!as) return { listings: [], total: null, pageSize: null, offset: null };
  const pageSize = as.pageInfo?.pageSize;
  const offset = as.pageInfo?.currentOffset;
  return {
    listings: as.edges.map((e) => normalizeNode(e.node as Parameters<typeof normalizeNode>[0], { collectedAt })),
    total: typeof as.totalCount === 'number' ? as.totalCount : null,
    pageSize: typeof pageSize === 'number' ? pageSize : null,
    offset: typeof offset === 'number' ? offset : null,
  };
}

// readTotal: só o totalCount (usado pelo crawl/watch para saber quantas páginas percorrer).
export function readTotal(html: string): number | null {
  const tc = extractAdvertSearch(html)?.totalCount;
  return typeof tc === 'number' ? tc : null;
}

// Chave de dedupe / identidade estável: o `id` do anúncio (fallback detail_url).
export function recordId(rec: StandvirtualRecord): string | null {
  return rec.id || rec.detail_url || null;
}
