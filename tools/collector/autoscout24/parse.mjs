// autoscout24/parse.mjs — extrai os dados de uma página de listagem do AutoScout24.
//
// A página é Next.js (a MESMA stack Scout24 do coletor autotrader.nl): os dados vêm no
// <script id="__NEXT_DATA__"> (SSR). Extraímos `props.pageProps.listings[]` (até 100/página
// com size=100), `numberOfResults`/`numberOfPages` e a `taxonomy` (marcas com IDs → seed do
// modo --full, sem hardcode).

import { normalizeListing } from './schema.mjs';

// Extrai o objeto __NEXT_DATA__ da página. Devolve null se não existir.
export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Parse de uma página → { listings, numberOfResults, numberOfPages, taxonomy }.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const data = extractNextData(html);
  const pp = data?.props?.pageProps;
  if (!pp || !Array.isArray(pp.listings)) {
    return { listings: [], numberOfResults: null, numberOfPages: null, taxonomy: null };
  }
  return {
    listings: pp.listings.map((L) => normalizeListing(L, { collectedAt })),
    numberOfResults: pp.numberOfResults ?? null,
    numberOfPages: pp.numberOfPages ?? null,
    taxonomy: pp.taxonomy ?? null,
  };
}

// Semente de marcas para o --full, a partir da taxonomy do próprio __NEXT_DATA__
// (`makesSorted` = [{label, value:makeId}]). Sem hardcode: as marcas (com IDs) vêm do site.
// Devolve [{ id, label, slug }] ordenado por label. `slug` é uma conveniência para o URL
// path-based `/lst/<slug>`; o filtro fiável é sempre `mmvmk0=<id>`.
export function extractMakes(taxonomy) {
  const src = taxonomy?.makesSorted;
  if (!Array.isArray(src)) return [];
  return src
    .filter((m) => m && m.value != null && m.label)
    .map((m) => ({ id: String(m.value), label: String(m.label), slug: slugify(m.label) }));
}

// Marcas mais populares (taxonomy.topMakes) — usadas na amostra por omissão.
export function extractTopMakes(taxonomy) {
  const src = taxonomy?.topMakes;
  if (!Array.isArray(src)) return [];
  return src
    .filter((m) => m && m.value != null && m.label)
    .map((m) => ({ id: String(m.value), label: String(m.label), slug: slugify(m.label) }));
}

// slugify: "Mercedes-Benz" → "mercedes-benz", "Alfa Romeo" → "alfa-romeo".
export function slugify(label) {
  return String(label).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Chave de dedupe: o id/UUID do anúncio (estável e único no AS24).
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
