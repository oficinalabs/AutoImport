// autouncle/crawl.ts — recolha batch do autouncle.pt: paginação `?page=N`, dedupe, checkpoint,
// NDJSON. Mesma FORMA do autoboerse (fatiamento por marca, dedupe global, checkpoint/resume, stats).
//
// COBERTURA (--full): o meta-motor indexa ~99 mil anúncios PT, mas a paginação satura por volta da
// página ~100 (25/pág → ~2.500 acessíveis por query; páginas mais fundas dão 404). E — crítico — o
// robots proíbe os SRP com filtros/ordenação por query (`s[...]=`), pelo que NÃO podemos fatiar por
// query. Fatiamos então por MARCA via PATH SEO canónico (`/pt/carros-usados/{Marca}`), com a lista de
// marcas (e contagens) vinda da config API `/api/v4/car_search_form/config` (robots-permitida). Marcas
// abaixo do teto ficam 100%; as ~14 densas (Peugeot/Renault/Mercedes/BMW…, >2.500) ficam pela primeira
// fatia de ~2.500 — limitação honesta do teto de paginação (o slug de modelo do site NÃO mapeia 1:1
// com o config, logo o sub-corte por modelo seria frágil). Ver research/autouncle-investigacao.md.
//   • default : uma query (marca opcional via --brand), até `maxPages` páginas (amostra).
//   • --full  : uma query por marca (semeadas do config), cada uma até `maxPages`/teto.

import { parseListingPage, listingUrl, parseBrands, recordId } from './parse.ts';
import { BASE, CONFIG_PATH } from './http.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import type { AutouncleRecord } from './schema.ts';

const CAP_PAGINAS = 120;   // salvaguarda dura (o site esgota antes, ~100 → 404 → página vazia → break)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  byGearbox: Record<string, number>;
  byRating: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
  minDaysOnMarket: number | null;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

function statsVazias(): Stats {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byFuel: {}, byGearbox: {},
    byRating: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, minDaysOnMarket: null,
  };
}
function atualizaStats(stats: Stats, r: AutouncleRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byGearbox[r.gearbox || '?'] = (stats.byGearbox[r.gearbox || '?'] || 0) + 1;
  stats.byRating[r.price_rating ?? '?'] = (stats.byRating[r.price_rating ?? '?'] || 0) + 1;
  if (r.days_on_market != null && (stats.minDaysOnMarket === null || r.days_on_market < stats.minDaysOnMarket)) {
    stats.minDaysOnMarket = r.days_on_market;
  }
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<AutouncleRecord, Stats>({
    outDir, source: 'autouncle', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (semeadas do config API, densas primeiro). Sem --full: uma só query
  // (marca opcional via --brand).
  let queries: { label: string; brand: string | null; expected?: number }[];
  if (full) {
    const cfg = await http.fetchJson(BASE + CONFIG_PATH);
    const brands = parseBrands(cfg);
    queries = brands.map((b) => ({ label: b.brand, brand: b.brand, expected: b.count }));
    console.log(`--full: ${queries.length} marcas a percorrer (top: ${queries.slice(0, 5).map((q) => `${q.label}(${q.expected})`).join(', ')}…)`);
    if (!queries.length) { console.warn('  ⚠ config sem marcas — a cair para query única'); queries = [{ label: brand || 'todos', brand }]; }
  } else {
    queries = [{ label: brand || 'todos', brand }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(listingUrl({ brand: q.brand, page }), { validate: (t) => t.includes('"@type":"ItemList"') });
      if (!html) return null;                              // falha/404 (teto) → passa à próxima query
      const { listings, total } = parseListingPage(html, { collectedAt, forcedMake: q.brand || null });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
    logLine: (q, page, novos, stats) =>
      `  ${q.label} p${page}: +${novos} novos (total ${stats.records}${q.expected ? `/${q.expected}` : ''})`,
    stop: ({ novos, page }) => novos === 0 && page > 1,   // página sem carros novos (repetição) → fim
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
