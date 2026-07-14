// aramisauto/crawl.ts — recolha batch do aramisauto.com: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/autoboerse (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a listagem geral `/achat/?page=N` (24/pág) PAGINA ATÉ AO FIM sem teto — a
// página seguinte ao último resultado devolve 404 (verificado: p100 ok, p130 = 404). Como o
// catálogo é pequeno (~2.871), o --full podia até ser só paginar `/achat/` até esgotar. Ainda
// assim, para fidelidade ao molde e robustez, o --full FATIA por CATEGORIA (silos SEO
// `/achat/{categoria}/`), que particionam o catálogo (as contagens do facet `categoryId` somam
// exatamente o total). Cada silo pagina com `?page=N`; o dedupe global apanha qualquer resíduo.
// `--slice <silo>` faz uma só query a `/achat/{silo}/` (categoria, combustível, `occasion`, `neuves`).

import { BASE } from './http.ts';
import { parseListingPage, recordId, temNuxt, CATEGORIAS } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AramisautoRecord } from './schema.ts';

const CAP_PAGINAS = 200;   // salvaguarda; na prática a listagem esgota antes (404 → páginas vazias)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  byOfferType: Record<string, number>;
  byCategory: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
  maxId: number | null;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  slice?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// URL de listagem. `slice` (silo SEO, ex. "diesel" ou "4x4-et-suv") fatia via path; page>1 → ?page=N.
function urlListagem(slice: string | null, page: number) {
  const path = slice ? `/achat/${slice}/` : '/achat/';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, byOfferType: {}, byCategory: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, maxId: null };
}
function atualizaStats(stats: Stats, r: AramisautoRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byOfferType[r.offer_type || '?'] = (stats.byOfferType[r.offer_type || '?'] || 0) + 1;
  stats.byCategory[r.category || '?'] = (stats.byCategory[r.category || '?'] || 0) + 1;
  const idNum = Number(r.id);
  if (Number.isFinite(idNum)) stats.maxId = stats.maxId === null ? idNum : Math.max(stats.maxId, idNum);
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, slice?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, slice = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<AramisautoRecord, Stats>({
    outDir, source: 'aramisauto', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por categoria (silos que particionam o catálogo). Sem --full: uma só query
  // (com silo opcional via --slice).
  let queries: { label: string; slice: string | null }[];
  if (full) {
    queries = CATEGORIAS.map((c) => ({ label: c, slice: c }));
    console.log(`--full: ${queries.length} categorias a percorrer (${queries.map((q) => q.label).join(', ')})`);
  } else {
    queries = [{ label: slice || 'achat', slice }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.slice, page), { validate: temNuxt });
      if (!html) return null;                              // 404 (fim) ou falha → passa à query seguinte
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
