// flexicar/parse.mjs — extração dos dados de uma página de listagem do flexicar.es.
//
// PADRÃO-MOLDE: autoboerse/autotrader (`__NEXT_DATA__` SSR), NÃO o JSON-LD do autocasion. A fonte é
// `props.pageProps.initialVehicles` — array de 12 veículos ricos — + `countVehicles` (total da query).
//
// ⚠️ O SSR devolve SEMPRE 12 (o `?page=N` é ignorado no servidor; a paginação real é por XHR a
// services.flexicar.es, que tem robots `Disallow: /` → não usamos). A cobertura obtém-se fatiando
// facetas (marca / marca·modelo / província / …), cada URL a render 12. O seed de `--full` são os
// ~9.685 URLs `…/segunda-mano/` do sitemap (facetas granulares têm ≤12 → captura total da fatia).

import { normalizeVehicle, buildDealerMap } from './schema.mjs';

// (1) Extrai e faz parse do bloco __NEXT_DATA__ (JSON puro num <script id="__NEXT_DATA__">).
export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// (2) Parse completo de uma página → { listings, total }.
// O `dealerships` da PRÓPRIA página serve para derivar região/CP de cada veículo (mapa cidade→província).
export function parseListingPage(html, { collectedAt = null } = {}) {
  const nd = extractNextData(html);
  const pp = nd?.props?.pageProps;
  if (!pp) return { listings: [], total: null };
  const vehicles = Array.isArray(pp.initialVehicles) ? pp.initialVehicles : [];
  const dealerMap = buildDealerMap(pp.dealerships || []);
  const listings = vehicles.map((v) => normalizeVehicle(v, { dealerMap, collectedAt }));
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query (`countVehicles` no SSR). Devolve null se não encontrar.
export function readTotal(html) {
  const nd = extractNextData(html);
  const n = nd?.props?.pageProps?.countVehicles;
  return Number.isFinite(n) ? n : null;
}

// Slugs de marca para os modos default/--brand: vêm de `pageProps.brands` (ex. {key:'audi',...}).
// Usam-se nas rotas SEO `/{marca}/segunda-mano/`.
export function extractBrandSlugs(html) {
  const nd = extractNextData(html);
  const brands = nd?.props?.pageProps?.brands;
  if (!Array.isArray(brands)) return [];
  return brands.map((b) => b.key).filter(Boolean).map((s) => String(s).toLowerCase());
}

// Facetas do sitemap para o modo --full: todos os paths `…/segunda-mano/` do sitemap.xml (marca,
// marca·modelo, marca·modelo·província, carroçaria, preço…). Cada um render 12 no SSR.
export function extractSitemapFacets(xml) {
  const set = new Set();
  const re = /<loc>\s*(https?:\/\/[^<]*?\/segunda-mano\/)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const path = m[1].replace(/^https?:\/\/[^/]+/, '');   // guarda só o path (relativo ao BASE)
    set.add(path);
  }
  return [...set];
}

// Chave de dedupe / sinal de recência: o `id` de stock (id crescente = mais recente).
export function recordId(rec) {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
