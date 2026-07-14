// autocasion/crawl.ts — recolha batch do autocasion.com: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autoboerse/crawl.ts (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a paginação da listagem geral (/coches-ocasion?page=N, 26/pág) satura muito
// antes dos ~122 mil anúncios. Para cobrir tudo, fatiamos por MARCA usando as páginas SEO
// `/coches-segunda-mano/{marca}-ocasion` (ex. .../audi-ocasion → só AUDI, pagina com ?page=N). Os
// slugs de marca vêm dos links da 1ª página, por isso o modo --full arranca com uma sondagem.
// Marcas densas (SEAT/Volkswagen/BMW/Audi) podem ainda saturar o cap; o corte fino seguinte seria
// por modelo/preço (não implementado — ver README).

import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutocasionRecord } from './schema.ts';

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
  maxId: number | null;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// URL de listagem. `brand` (slug, ex. "audi") fatia via página SEO; page>1 acrescenta ?page=N.
function urlListagem(brand: string | null, page: number) {
  const path = brand ? `/coches-segunda-mano/${brand}-ocasion` : '/coches-ocasion';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

const temLd = (t: string) => t.includes('application/ld+json');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, maxId: null };
}
function atualizaStats(stats: Stats, r: AutocasionRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.id != null) stats.maxId = stats.maxId === null ? r.id : Math.max(stats.maxId, r.id);
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<AutocasionRecord, Stats>({
    outDir, source: 'autocasion', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (descobre os slugs na 1ª página). Sem --full: uma só query
  // (com marca opcional via --brand).
  let queries: { label: string; brand: string | null }[];
  if (full) {
    const probe = await http.fetchText(urlListagem(null, 1), { validate: temLd });
    const slugs = probe ? extractBrandSlugs(probe) : [];
    queries = slugs.map((s) => ({ label: s, brand: s }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{ label: brand || 'coches-ocasion', brand }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.brand, page), { validate: temLd });
      if (!html) return null;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
