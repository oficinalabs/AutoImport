// standvirtual/parse.mjs — extrai os anúncios de uma página de listagem do standvirtual.com.
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

import { normalizeNode } from './schema.mjs';

// Extrai e faz parse do objeto __NEXT_DATA__. O <script> tem atributos extra (nonce, crossorigin),
// por isso o regex aceita `[^>]*` antes do `>`. Devolve null se não existir/não parsear.
export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Localiza e desembrulha o `advertSearch` dentro do urqlState (a entrada é uma string JSON).
export function extractAdvertSearch(html) {
  const data = extractNextData(html);
  const urql = data?.props?.pageProps?.urqlState;
  if (!urql || typeof urql !== 'object') return null;
  for (const k of Object.keys(urql)) {
    const raw = urql[k]?.data;
    if (typeof raw !== 'string' || !raw.includes('advertSearch')) continue;
    try {
      const as = JSON.parse(raw).advertSearch;
      if (as && Array.isArray(as.edges)) return as;
    } catch { /* tenta a próxima entrada */ }
  }
  return null;
}

// Parse de uma página → { listings, total, pageSize, offset }.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const as = extractAdvertSearch(html);
  if (!as) return { listings: [], total: null, pageSize: null, offset: null };
  return {
    listings: as.edges.map((e) => normalizeNode(e.node, { collectedAt })),
    total: typeof as.totalCount === 'number' ? as.totalCount : null,
    pageSize: as.pageInfo?.pageSize ?? null,
    offset: as.pageInfo?.currentOffset ?? null,
  };
}

// readTotal: só o totalCount (usado pelo crawl/watch para saber quantas páginas percorrer).
export function readTotal(html) {
  return extractAdvertSearch(html)?.totalCount ?? null;
}

// Chave de dedupe / identidade estável: o `id` do anúncio (fallback detail_url).
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
