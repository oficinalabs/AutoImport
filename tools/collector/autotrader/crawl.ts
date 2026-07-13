// autotrader/crawl.ts — recolha batch do AutoTrader.nl: paginação, dedupe, checkpoint,
// NDJSON. Mesma forma do theparking/crawl.ts.
//
// COBERTURA (--full): a paginação satura no cap de 200 páginas (~4.000 de 233 mil). Para
// cobrir tudo, fatiamos por FAIXA DE PREÇO (params pricefrom/priceto) — cada faixa é uma
// query independente. Faixas densas do meio podem ainda saturar; podem combinar-se com marca
// (mmvmk0) para cortes mais finos.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, recordId } from './parse.ts';
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

// Estado persistido (checkpoint) para retomar (--resume).
interface Checkpoint {
  startedAt: string;
  ndjson: string;
  doneQueries: Record<string, number>;
  seen: string[];
  stats: Stats;
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
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autotrader-checkpoint.json');

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autotrader-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

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

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.params, page);
      const html = await http.fetchText(url, { validate: (t) => t.includes('__NEXT_DATA__') });
      if (!html) break;
      const { listings, numberOfResults, numberOfPages } = parseListingPage(html, { collectedAt });
      if (page === 1) stats.nbResults[q.label] = numberOfResults;
      if (!listings.length) break;                         // fim dos resultados
      let novos = 0;
      for (const r of listings) {
        const id = recordId(r);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
        atualizaStats(stats, r);
        novos++;
      }
      stats.pages++;
      ckpt.doneQueries[q.label] = page;
      saveCkpt();
      console.log(`  ${q.label} p${page}: +${novos} novos (total ${stats.records})`);
      if (numberOfPages && page >= numberOfPages) break;   // não há mais páginas nesta query
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
