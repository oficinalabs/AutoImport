// autotrader/crawl.ts — recolha batch do AutoTrader.nl: paginação, dedupe, checkpoint,
// NDJSON. Inner-core (seen/append/stats/checkpoint) e loop de páginas em lib/crawl.ts.
//
// COBERTURA (--full): a paginação satura no cap de 200 páginas (~4.000 de 233 mil). Para
// cobrir tudo, fatiamos por FAIXA DE PREÇO (params pricefrom/priceto) — cada faixa é uma
// query independente. Faixas densas do meio podem ainda saturar; podem combinar-se com marca
// (mmvmk0) para cortes mais finos.

import { parseListingPage, recordId } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutotraderRecord } from './schema.ts';

const BASE = 'https://www.autotrader.nl';
const CAP_PAGINAS = 200;   // limite duro do site

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  make?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// Faixas de preço (€) para o modo --full. Mais finas na zona densa (baixo-médio).
const FAIXAS_PRECO = [
  [0, 1500], [1500, 2500], [2500, 3500], [3500, 4500], [4500, 5500], [5500, 6500],
  [6500, 7500], [7500, 8500], [8500, 9500], [9500, 11000], [11000, 12500], [12500, 14000],
  [14000, 16000], [16000, 18500], [18500, 21000], [21000, 25000], [25000, 30000],
  [30000, 40000], [40000, 60000], [60000, 100000], [100000, 0],
];

function urlListagem(params: Record<string, string>, page: number) {
  const qs = new URLSearchParams({ atype: 'C', ...params });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/auto/occasions?${qs}`;
}

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: AutotraderRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, make?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, make = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<AutotraderRecord, Stats>({
    outDir, source: 'autotrader', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  const baseParams: Record<string, string> = make ? { mmvmk0: String(make) } : {};
  let queries: { label: string; params: Record<string, string> }[];
  if (full) {
    queries = FAIXAS_PRECO.map(([from, to]) => ({
      label: `€${from}-${to || '+'}`,
      params: { ...baseParams, ...(from ? { pricefrom: String(from) } : {}), ...(to ? { priceto: String(to) } : {}) },
    }));
  } else {
    queries = [{ label: 'occasions', params: baseParams }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.params, page), { validate: (t) => t.includes('__NEXT_DATA__') });
      if (!html) return null;
      const { listings, numberOfResults, numberOfPages } = parseListingPage(html, { collectedAt });
      if (page === 1) writer.stats.nbResults[q.label] = numberOfResults;
      return { listings, last: numberOfPages ? page >= numberOfPages : false };
    },
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
