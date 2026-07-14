// trovit/crawl.ts — recolha batch do coches.trovit.es: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/crawl.ts (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): o Trovit NÃO expõe uma página "todos os coches" (rota `/coches` dá 404) —
// só facetas SEO `/coches/{slug}`. Para cobrir o catálogo, fatiamos por MARCA (`MARCAS` em
// parse.ts): cada marca é `/coches/{marca}` e pagina no PATH (`/coches/{marca}/{N}`). Marcas
// densas (Audi ~26k, Citroën ~22k, a 25/pág) podem saturar o cap de paginação; o corte fino
// seguinte seria por marca+modelo/região (o site expõe esses slugs, ex. `/coches/audi-a3`,
// `/coches/audi-madrid`) — não implementado (ver README).

import { BASE } from './http.ts';
import { parseListingPage, recordId, MARCAS, DEFAULT_SLUG } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { TrovitRecord } from './schema.ts';

const CAP_PAGINAS = 500;   // salvaguarda; na prática a listagem esgota antes (páginas vazias)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// URL de listagem. `slug` (marca/cidade/…); page>1 acrescenta o número no PATH (`/coches/audi/2`).
function urlListagem(slug: string, page: number) {
  return `${BASE}/coches/${slug}${page > 1 ? `/${page}` : ''}`;
}

// Uma página só é válida se trouxer cards de coches (evita retentar páginas de erro/vazias como se
// fossem 200 úteis).
const temCards = (t: string) => t.includes('item-cars-snippet');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: TrovitRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source_site || '?'] = (stats.bySource[r.source_site || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
// `brand` = qualquer slug de faceta do Trovit (marca/cidade/região/modelo), não só marca.
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<TrovitRecord, Stats>({
    outDir, source: 'trovit', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (lista fixa MARCAS). Sem --full: uma só query (slug via --brand,
  // ou o DEFAULT_SLUG amplo).
  let queries: { label: string; slug: string }[];
  if (full) {
    queries = MARCAS.map((s) => ({ label: s, slug: s }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    const slug = brand || DEFAULT_SLUG;
    queries = [{ label: slug, slug }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.slug, page), { validate: temCards });
      if (!html) return null;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
    stop: ({ novos }) => novos === 0,   // página repetida → marca esgotada
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
