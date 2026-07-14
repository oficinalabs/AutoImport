// crawl.ts — orquestração da recolha: plano de queries, paginação, dedupe,
// checkpoint/resume e escrita NDJSON. Inner-core (seen/append/stats/checkpoint) e loop de
// páginas em lib/crawl.ts; aqui só o plano de queries e o fetch por página.
//
// PORQUÊ NDJSON: um registo JSON por linha permite escrita incremental (append) e
// leitura em streaming de ficheiros grandes — ideal para recolhas longas.
//
// PORQUÊ fatiar por país×marca (modo --full): a paginação de um país sozinho satura e
// repete; queries mais estreitas dão mais cobertura útil e são mais estáveis.

import { BASE } from './http.ts';
import { parseListingPage, readNbResults, recordId } from './parse.ts';
import { fetchModelSlugs } from './sitemap.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { TheparkingRecord } from './schema.ts';

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
  countries: string[];
  make?: string | null;
  full?: boolean;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// Constrói o URL de uma página de listagem. Página 1 não leva número no path.
function urlDaPagina(queryPath: string, page: number) {
  return page === 1
    ? `${BASE}/used-cars/${queryPath}.html`
    : `${BASE}/used-cars/${queryPath}/${page}.html`;
}

// Estado inicial das estatísticas (agregação corrida — sem guardar todos os preços).
function statsVazias(): Stats {
  return {
    records: 0, pages: 0,
    byCountry: {}, bySource: {},
    price: { count: 0, sum: 0, min: null, max: null },
    nbResults: {},
  };
}

function atualizaStats(stats: Stats, r: TheparkingRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) {
    const p = stats.price;
    p.count++; p.sum += r.price;
    p.min = p.min === null ? r.price : Math.min(p.min, r.price);
    p.max = p.max === null ? r.price : Math.max(p.max, r.price);
  }
}

// Recolha principal. `config`: { http, countries[], make?, full?, maxPages, outDir, resume? }.
export async function crawl(config: CrawlConfig) {
  const { http, countries, make = null, full = false, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<TheparkingRecord, Stats>({
    outDir, source: 'theparking', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries (paths string; a query É o label) --------------
  let queries: string[];
  if (full) {
    const slugs = await fetchModelSlugs(http);
    console.log(`plano completo: ${countries.length} países × ${slugs.length} modelos`);
    queries = countries.flatMap((c) => slugs.map((s) => `${c}/${s}`));
  } else {
    // modo amostra: um path por país (opcionalmente estreitado por marca).
    queries = countries.map((c) => (make ? `${c}/${make}` : c));
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, labelOf: (q) => q,
    fetchPage: async (q, page, collectedAt) => {
      // validate: a página tem de conter blocos Vehicle; senão, é o Cloudflare a devolver 200
      // vazio (rate-limit intermitente) → o http faz retry.
      const html = await http.fetchText(urlDaPagina(q, page), { validate: (t) => t.includes('"@type": "Vehicle"') });
      if (!html) return null;                            // esgotou retries → passa à query seguinte
      if (page === 1) writer.stats.nbResults[q] = readNbResults(html);
      return { listings: parseListingPage(html, { collectedAt }) };
    },
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
