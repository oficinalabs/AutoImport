// custojusto/parse.ts — extrai os dados de uma página de listagem do CustoJusto.pt.
//
// A página é Next.js SSR: os dados vêm no <script id="__NEXT_DATA__"> (flag __N_SSP). Extraímos
// `props.pageProps.listItems[]` (40/página) + o total real em
// `props.pageProps.initialState.search.resources.totalAds`. O default de ordenação é
// SORT_DESC_PUBLISH_DATE (recência real; cada item traz `listTime` ISO).
//
// MOLDE: autoboerse/flexicar (`__NEXT_DATA__` SSR). Como o Flexicar, a paginação (`?o=N`) está
// robots-proibida → a cobertura é por FACETAS (marca/distrito/categoria), não por página.
//
// MAKE/MODEL: o `listItem` NÃO traz make/model estruturados (só fuel/gearbox/regdate em `params`).
// Extraímos a marca casando o título contra a taxonomia `brands` (75 marcas) que vem no próprio
// SSR — robusto para marcas multi-palavra (Mercedes-Benz, Alfa Romeo, Land Rover). Ver schema.ts.

import { normalizeListing, buildBrandMatcher, type Brand, type CustojustoRecord } from './schema.ts';

// Forma mínima do __NEXT_DATA__ que consumimos (payload externo dinâmico → campos opcionais).
interface NextData {
  props?: { pageProps?: {
    listItems?: unknown;
    initialState?: { search?: {
      resources?: { totalAds?: unknown };
      options?: { brands?: unknown; baseLocations?: unknown };
    } };
  } };
}

// Resultado do parse de uma página de listagem.
export interface ParsedPage {
  listings: CustojustoRecord[];
  total: number | null;
  brands: Brand[];
  districts: string[];
}

// Extrai o objeto __NEXT_DATA__ da página. Devolve null se não existir.
export function extractNextData(html: string): NextData | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Total de anúncios da query (`initialState.search.resources.totalAds`). Null se não encontrar.
export function readTotal(html: string): number | null {
  const nd = extractNextData(html);
  const n = nd?.props?.pageProps?.initialState?.search?.resources?.totalAds;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Taxonomia de marcas do SSR (`initialState.search.options.brands` → [{id, name, shortName}]).
// Serve para (a) casar a marca no título e (b) semear o modo --full.
export function extractCarBrands(html: string): Brand[] {
  const nd = extractNextData(html);
  const arr = nd?.props?.pageProps?.initialState?.search?.options?.brands;
  if (!Array.isArray(arr)) return [];
  return arr.filter((b) => b?.shortName)
    .map((b) => ({ name: b.name, shortName: b.shortName }));
}

// Distritos (regiões) do SSR (`initialState.search.options.baseLocations[].shortName`).
// São os 20 distritos/ilhas de PT — seed da dimensão "distrito" do modo --full.
export function extractDistricts(html: string): string[] {
  const nd = extractNextData(html);
  const arr = nd?.props?.pageProps?.initialState?.search?.options?.baseLocations;
  if (!Array.isArray(arr)) return [];
  return arr.map((d) => d?.shortName).filter(Boolean);
}

// Parse de uma página → { listings, total, brands, districts }.
// brands/districts servem de seed ao --full (vêm em todas as páginas; usamo-los só na 1ª).
// `brandHint` (nome da marca da faceta, quando aplicável) é fallback se o matcher do título falhar.
export function parseListingPage(html: string, { collectedAt = null, brandHint = null }: { collectedAt?: string | null; brandHint?: string | null } = {}): ParsedPage {
  const nd = extractNextData(html);
  const pp = nd?.props?.pageProps;
  const list = pp?.listItems;
  if (!pp || !Array.isArray(list)) return { listings: [], total: null, brands: [], districts: [] };
  const matcher = buildBrandMatcher(extractCarBrands(html));
  return {
    listings: list.map((it) => normalizeListing(it, { collectedAt, matcher, brandHint })),
    total: readTotal(html),
    brands: extractCarBrands(html),
    districts: extractDistricts(html),
  };
}

// Chave de dedupe / sinal de recência: o `listID` (id crescente = mais recente). Fallback: detail_url.
export function recordId(rec: CustojustoRecord): string | null {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
