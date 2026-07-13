// autotrader/parse.mjs — extrai os dados de uma página de listagem do AutoTrader.nl.
//
// A página é Next.js: os dados vêm no <script id="__NEXT_DATA__"> (SSR). Extraímos
// `props.pageProps.listings[]` (20/página) + `numberOfResults`/`numberOfPages`.

import { normalizeListing } from './schema.mjs';

// Extrai o objeto __NEXT_DATA__ da página. Devolve null se não existir.
export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Parse de uma página → { listings: registos normalizados, numberOfResults, numberOfPages }.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const data = extractNextData(html);
  const pp = data?.props?.pageProps;
  if (!pp || !Array.isArray(pp.listings)) return { listings: [], numberOfResults: null, numberOfPages: null };
  return {
    listings: pp.listings.map((L) => normalizeListing(L, { collectedAt })),
    numberOfResults: pp.numberOfResults ?? null,
    numberOfPages: pp.numberOfPages ?? null,
  };
}

// Chave de dedupe: o id/UUID do anúncio.
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
