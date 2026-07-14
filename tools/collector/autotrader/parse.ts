// autotrader/parse.ts — extrai os dados de uma página de listagem do AutoTrader.nl.
//
// A página é Next.js: os dados vêm no <script id="__NEXT_DATA__"> (SSR). Extraímos
// `props.pageProps.listings[]` (20/página) + `numberOfResults`/`numberOfPages`.

import { normalizeListing, type AutotraderRecord } from './schema.ts';

// Resultado do parse de uma página de listagem.
export interface ParsedPage {
  listings: AutotraderRecord[];
  numberOfResults: number | null;
  numberOfPages: number | null;
}

// Extrai o objeto __NEXT_DATA__ da página. Devolve null se não existir. O payload é dinâmico
// → `unknown` + narrowing em quem consome.
export function extractNextData(html: string): unknown {
  const m = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// Parse de uma página → { listings: registos normalizados, numberOfResults, numberOfPages }.
export function parseListingPage(html: string, { collectedAt = null }: { collectedAt?: string | null } = {}): ParsedPage {
  const data = extractNextData(html) as { props?: { pageProps?: { listings?: unknown; numberOfResults?: unknown; numberOfPages?: unknown } } } | null;
  const pp = data?.props?.pageProps;
  if (!pp || !Array.isArray(pp.listings)) return { listings: [], numberOfResults: null, numberOfPages: null };
  return {
    listings: pp.listings.map((L) => normalizeListing(L, { collectedAt })),
    numberOfResults: typeof pp.numberOfResults === 'number' ? pp.numberOfResults : null,
    numberOfPages: typeof pp.numberOfPages === 'number' ? pp.numberOfPages : null,
  };
}

// Chave de dedupe: o id/UUID do anúncio.
export function recordId(rec: AutotraderRecord): string | null {
  return rec.id || rec.detail_url || null;
}
