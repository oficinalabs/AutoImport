// olxpt/parse.mjs — extrai os anúncios de uma página de listagem SSR do olx.pt e constrói as URLs.
//
// A página embute o estado num literal `window.__PRERENDERED_STATE__ = "…"` (uma string JS cujo
// conteúdo é JSON escapado). Desescapamos o literal (JSON.parse do literal) → string JSON → JSON.parse
// → objeto. Os anúncios estão em `state.listing.listing.ads[]` (52/página) com `totalElements`,
// `totalPages` e `pageNumber` (0-indexado). Ver research/olxpt-investigacao.md.

import { normalizeAd } from './schema.mjs';
import { BASE, CAT_PATH } from './http.mjs';

export const PAGE_MAX = 100;                    // teto duro de páginas do OLX por query/faceta
export const ORDER_RECENTE = 'created_at:desc'; // sort por data (honrado pelo SSR) — recência p/ watch

// Desembrulha o objeto de estado do HTML. Devolve null se não existir/parsear.
export function extractState(html) {
  // O valor é um literal de string JS: window.__PRERENDERED_STATE__ = "…";
  const m = /window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/s.exec(html);
  if (!m) return null;
  try {
    const jsonStr = JSON.parse(m[1]);   // 1º parse: literal JS → string JSON
    return JSON.parse(jsonStr);         // 2º parse: string JSON → objeto
  } catch { return null; }
}

// Parse de uma página → { listings, total, totalPages, pageNumber }.
// forcedMake: nome da marca da faceta (--full por marca) para carimbar autoritativamente.
export function parseListingPage(html, { collectedAt = null, forcedMake = null } = {}) {
  const state = extractState(html);
  const ll = state?.listing?.listing;
  if (!ll || !Array.isArray(ll.ads)) return { listings: [], total: null, totalPages: null, pageNumber: null };
  return {
    listings: ll.ads.map((a) => normalizeAd(a, { collectedAt, forcedMake })),
    total: typeof ll.totalElements === 'number' ? ll.totalElements : null,
    totalPages: typeof ll.totalPages === 'number' ? ll.totalPages : null,
    pageNumber: typeof ll.pageNumber === 'number' ? ll.pageNumber : null,
  };
}

// Constrói a URL de listagem SSR.
// - make/region: facetas via path SEO (`/carros/{make}/` ou `/carros/{region}/`). Se ambas forem
//   passadas, a marca tem precedência (não combinamos path para não depender de rotas não validadas).
// - page: `?page=N` (N>1). order: `?search[order]=created_at:desc` (recência, honrado pelo SSR).
export function listingUrl({ make = null, region = null, page = 1, order = null } = {}) {
  let path = CAT_PATH;
  if (make) path += `${make}/`;
  else if (region) path += `${region}/`;
  const qs = new URLSearchParams();
  if (page > 1) qs.set('page', String(page));
  if (order) qs.set('search[order]', order);
  const q = qs.toString();
  return `${BASE}${path}${q ? `?${q}` : ''}`;
}

// Chave de dedupe / identidade estável: o `id` do anúncio (fallback detail_url).
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
