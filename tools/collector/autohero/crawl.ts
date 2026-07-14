// autohero/crawl.ts — recolha batch do autohero.com: paginação por offset (API), dedupe,
// checkpoint, NDJSON. Inner-core (seen/append/stats/checkpoint) em lib/crawl.ts; aqui o loop
// PRÓPRIO por offset (a unidade é uma PÁGINA DA API — limit=100 — não uma página HTML).
//
// COBERTURA: a API pagina por `offset` de forma estável (sort `newest_eligible`, determinístico) →
// iterar offset 0,100,200,… até `total` cobre TODO o catálogo (~7,4k no DE) em ~75 pedidos, sem
// facetas nem lacunas (o dedupe global apanha qualquer resíduo de borda). Por isso NÃO precisamos do
// truque de facetas do Flexicar: aqui a própria API é paginável e robots-permitida.
//   • default : pagina até `maxPages` páginas (amostra).
//   • --full  : pagina até esgotar o `total` (catálogo completo).

import { buildVariables, parseAdsResponse, recordId, LIMIT_MAX, SORT_RECENTE } from './parse.ts';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import type { AutoheroRecord } from './schema.ts';

const CAP_PAGINAS = 2000;   // salvaguarda dura (a paginação esgota bem antes, ao chegar ao total)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  byGearbox: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  total: number | null;
  latestPublished: string | null;
}

// Cursor persistido (checkpoint): página feita + o sort em curso (fixo entre resumes).
interface OffsetCursor { donePages: number; sort: string }

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
  sort?: string;
}

function statsVazias(): Stats {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byFuel: {}, byGearbox: {},
    price: { count: 0, sum: 0, min: null, max: null }, total: null, latestPublished: null,
  };
}
function atualizaStats(stats: Stats, r: AutoheroRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byGearbox[r.gearbox || '?'] = (stats.byGearbox[r.gearbox || '?'] || 0) + 1;
  const pub = r.listing_first_published_at;
  if (pub && (stats.latestPublished === null || pub > stats.latestPublished)) stats.latestPublished = pub;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, maxPages, outDir, resume?, sort? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, maxPages = 5, outDir, resume = false, sort = SORT_RECENTE } = config;
  const writer = createCrawlWriter<AutoheroRecord, Stats>({
    outDir, source: 'autohero', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
    resumeLog: ({ stats, cursor }) => `↻ resume: ${stats.records} registos já recolhidos (página ${(cursor as OffsetCursor).donePages})`,
  });
  const stats = writer.stats;

  let cursor = writer.cursor as OffsetCursor | null;
  if (!cursor) cursor = { donePages: 0, sort };

  // Nº de páginas a percorrer nesta invocação: --full → até ao total (descoberto na 1ª página);
  // sem --full → `maxPages`. Começamos onde o checkpoint parou.
  for (let page = cursor.donePages; page < CAP_PAGINAS; page++) {
    if (!full && page >= maxPages) break;
    const offset = page * LIMIT_MAX;
    if (stats.total !== null && offset >= stats.total) break;   // esgotou o catálogo
    const ads = await http.postGraphql(buildVariables({ offset, limit: LIMIT_MAX, sort: cursor.sort }));
    if (!ads) break;                                            // falha → para (retoma com --resume)
    const { listings, total } = parseAdsResponse(ads, { collectedAt: writer.collectedAt });
    if (page === 0) stats.total = total;
    if (!listings.length) break;                                // fim dos resultados
    let novos = 0;
    for (const r of listings) if (writer.add(r)) novos++;
    stats.pages++;
    cursor.donePages = page + 1;
    writer.save(cursor);
    console.log(`  pág ${page + 1} (offset ${offset}): +${novos} novos (acum ${stats.records}/${stats.total ?? '?'})`);
  }

  return { ndjsonPath: writer.ndjsonPath, stats };
}
