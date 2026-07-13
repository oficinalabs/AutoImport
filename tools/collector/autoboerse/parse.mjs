// autoboerse/parse.mjs — extrai os dados de uma página de listagem do autoboerse.de.
//
// A página é Next.js: os dados vêm no <script id="__NEXT_DATA__"> (SSR). Extraímos
// `props.pageProps.classifieds.classifiedList[]` (18/página) + `.total`, e ainda
// `props.pageProps.brands[]`/`provinces[]` (contagens) que servem de seed ao modo --full.
//
// DETAIL URL: cada anúncio é `/fahrzeugsuche/{slug}/{visibleId}`, mas o objeto do anúncio NÃO
// traz o slug. O HTML tem, porém, as âncoras exatas. Construímos aqui um mapa
// visibleId→path a partir do HTML e passamo-lo ao schema — mais fiável que reconstruir o slug.

import { normalizeListing } from './schema.mjs';

// Extrai o objeto __NEXT_DATA__ da página. Devolve null se não existir.
export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Mapa visibleId → path de detalhe, lido das âncoras do HTML (/fahrzeugsuche/{slug}/{visibleId}).
function mapaPaths(html) {
  const map = new Map();
  for (const m of html.matchAll(/\/fahrzeugsuche\/[a-z0-9-]+\/([A-Za-z0-9_-]+)/g)) {
    map.set(m[1], m[0]);
  }
  return map;
}

// Parse de uma página → { listings, total, brands, provinces }.
// brands/provinces só vêm preenchidos na 1ª página (seed do --full); nas seguintes ficam [].
export function parseListingPage(html, { collectedAt = null } = {}) {
  const data = extractNextData(html);
  const pp = data?.props?.pageProps;
  const list = pp?.classifieds?.classifiedList;
  if (!pp || !Array.isArray(list)) return { listings: [], total: null, brands: [], provinces: [] };
  const paths = mapaPaths(html);
  return {
    listings: list.map((C) => normalizeListing(C, { collectedAt, detailPath: paths.get(C.visibleId) })),
    total: pp.classifieds?.total ?? null,
    brands: Array.isArray(pp.brands) ? pp.brands : [],
    provinces: Array.isArray(pp.provinces) ? pp.provinces : [],
  };
}

// Chave de dedupe: o id/UUID do anúncio (fallback visibleId, depois detail_url).
export function recordId(rec) {
  return rec.id || rec.visibleId || rec.detail_url || null;
}
