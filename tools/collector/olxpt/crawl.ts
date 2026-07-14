// olxpt/crawl.ts — recolha batch do olx.pt: paginação por ?page=N (SSR), dedupe, checkpoint, NDJSON.
// Mesma FORMA do autoboerse (dedupe global por id, checkpoint/resume por query, stats).
//
// COBERTURA (--full): a paginação satura no teto de 100 páginas × 52 ≈ 5 200 (< 50,8 mil). Para cobrir
// tudo, fateia-se por MARCA — path SEO `/carros-motos-e-barcos/carros/{marca}/` (a lista de marcas é o
// seed validado em schema.MAKES, ordenado por densidade). Ao crawlar uma faceta de marca, carimba-se a
// marca da faceta (forcedMake) — mais fiável que detetá-la do título. As 2 marcas mais densas (BMW/
// Mercedes, ~5,5k) passam ligeiramente o teto e truncam nele — limitação documentada (ver README).
//   • default : uma query (secção inteira, ou --make/--region), até `maxPages` páginas.
//   • --full  : uma query por marca (seed), até esgotar cada faceta ou o teto.

import { parseListingPage, listingUrl, recordId, PAGE_MAX } from './parse.ts';
import { MAKES, SLUG_TO_NAME } from './schema.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import type { OlxptRecord } from './schema.ts';

interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySellerType: Record<string, number>;
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  byRegion: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  catalogTotal: number | null;
  latestCreated: string | null;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  make?: string | null;
  region?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

interface Query { label: string; make?: string | null; region?: string | null; forcedMake?: string | null }

function statsVazias(): Stats {
  return {
    records: 0, pages: 0, byCountry: {}, bySellerType: {}, byMake: {}, byFuel: {}, byRegion: {},
    price: { count: 0, sum: 0, min: null, max: null }, catalogTotal: null, latestCreated: null,
  };
}
function atualizaStats(stats: Stats, r: OlxptRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySellerType[r.seller_type || '?'] = (stats.bySellerType[r.seller_type || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  if (r.created_time && (stats.latestCreated === null || r.created_time > stats.latestCreated)) stats.latestCreated = r.created_time;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, make?, region?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, make = null, region = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<OlxptRecord, Stats>({
    outDir, source: 'olxpt', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (seed), carimbando a marca da faceta. Sem --full: uma só query
  // (opcionalmente restrita por --make <slug> ou --region <slug>).
  let queries: Query[];
  if (full) {
    queries = MAKES.map((m) => ({ label: m.slug, make: m.slug, forcedMake: m.name }));
    console.log(`--full: ${queries.length} marcas a percorrer (top: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{
      label: make || region || 'carros',
      make: make || null,
      region: make ? null : region,
      forcedMake: make ? (SLUG_TO_NAME[make] || null) : null,
    }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  let lastTotal: number | null = null;                     // total da página corrente, p/ o log
  await runPagedCrawl({
    writer, queries, cursor, maxPages,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchListing(listingUrl({ make: q.make, region: q.region, page }));
      if (!html) return null;                              // falha → passa à próxima query (retoma c/ --resume)
      const { listings, total } = parseListingPage(html, { collectedAt, forcedMake: q.forcedMake });
      if (page === 1 && total != null) writer.stats.catalogTotal = full ? writer.stats.catalogTotal : total;
      lastTotal = total;
      return { listings };
    },
    logLine: (q, page, novos, stats) =>
      `  ${q.label} p${page}${lastTotal != null ? `/${Math.min(lastTotal, PAGE_MAX * 52)}` : ''}: +${novos} novos (total ${stats.records})`,
    stop: ({ novos, page }) => novos === 0 && page > 1,   // faceta esgotada (só repetidos)
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
