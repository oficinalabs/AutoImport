// caetano/crawl.ts — recolha batch da Caetano: paginação por página da API, dedupe, checkpoint,
// NDJSON, stats. Mesma FORMA do autohero/crawl.ts (a unidade de recolha é uma PÁGINA DA API,
// não uma página HTML), com filtro de carros usados no parse.
//
// COBERTURA: a API pagina de forma estável por `page` (ordem default) → iterar page 1,2,3,… até ao
// `maxPage` cobre TODO o stock (~3,2k viaturas → ~13 páginas de 250; ~2,3k depois de filtrar só
// carros usados). O dedupe global por VIN apanha qualquer resíduo de borda. Não é preciso fatiar por
// marca (volume pequeno, uma só query paginável).
//   • default : pagina até `maxPages` páginas (amostra).
//   • --full  : pagina até esgotar o `maxPage` da API (catálogo completo).

import { parseSearchResponse, recordId, PAGE_SIZE } from './parse.ts';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import type { CaetanoRecord } from './schema.ts';

const CAP_PAGINAS = 200;   // salvaguarda dura (a paginação esgota bem antes, ao chegar ao maxPage)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byMake: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  byUsedType: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  rawTotal: number | null;
  latestUpdate: string | null;
}

// Cursor persistido (checkpoint) para retomar (--resume): páginas feitas + maxPage descoberto.
interface PageCursor {
  donePages: number;
  maxPage: number | null;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

function statsVazias(): Stats {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byRegion: {}, byFuel: {},
    byUsedType: {}, price: { count: 0, sum: 0, min: null, max: null }, rawTotal: null, latestUpdate: null,
  };
}
function atualizaStats(stats: Stats, r: CaetanoRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byUsedType[r.used_type || '?'] = (stats.byUsedType[r.used_type || '?'] || 0) + 1;
  if (r.update_time && (stats.latestUpdate === null || r.update_time > stats.latestUpdate)) stats.latestUpdate = r.update_time;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<CaetanoRecord, Stats>({
    outDir, source: 'caetano', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
    resumeLog: ({ stats, cursor }) => `↻ resume: ${stats.records} carros já recolhidos (página ${(cursor as PageCursor).donePages})`,
  });
  const stats = writer.stats;

  let cursor = writer.cursor as PageCursor | null;
  if (!cursor) cursor = { donePages: 0, maxPage: null };

  // page da API é 1-indexed. Começamos onde o checkpoint parou (donePages = nº de páginas já feitas).
  for (let done = cursor.donePages; done < CAP_PAGINAS; done++) {
    if (!full && done >= maxPages) break;
    const page = done + 1;
    if (cursor.maxPage !== null && page > cursor.maxPage) break;  // esgotou o catálogo (--full)
    const json = await http.postSearch({ page, numberElements: PAGE_SIZE });
    if (!json) break;                                             // falha → para (retoma com --resume)
    const { listings, rawTotal, maxPage, raw } = parseSearchResponse(json, { collectedAt: writer.collectedAt });
    if (done === 0) { stats.rawTotal = rawTotal; cursor.maxPage = maxPage; }
    if (!raw) break;                                              // página vazia = fim dos resultados
    let novos = 0;
    for (const r of listings) if (writer.add(r)) novos++;         // listings = só carros usados
    stats.pages++;
    cursor.donePages = page;
    writer.save(cursor);
    console.log(`  pág ${page}/${cursor.maxPage ?? '?'}: +${novos} carros usados (de ${raw} viaturas na página · acum ${stats.records})`);
  }

  return { ndjsonPath: writer.ndjsonPath, stats };
}
