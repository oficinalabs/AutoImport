// autouncle/crawl.ts — recolha batch do AutoUncle MULTI-PAÍS: um passo por mercado (domínio
// nacional), cada um com paginação `?page=N`, dedupe, checkpoint e NDJSON PRÓPRIOS
// (`autouncle-{code}-*`). Mesma FORMA do autoboerse (fatiamento por marca, dedupe global,
// checkpoint/resume, stats), multiplicada pelos mercados pedidos.
//
// COBERTURA (--full, igual em todos os domínios): a paginação satura por volta da página ~100
// (25/pág → ~2.500 acessíveis por query; páginas mais fundas dão 404). E — crítico — o robots
// proíbe os SRP com filtros/ordenação por query (`s[...]=`), pelo que NÃO podemos fatiar por
// query. Fatiamos então por MARCA via PATH SEO canónico (`{listPath}/{Marca}`), com a lista de
// marcas (e contagens) vinda da config API `/api/v4/car_search_form/config` (igual nos 14
// domínios). Marcas abaixo do teto ficam 100%; as densas (>2.500) ficam pela primeira fatia —
// limitação honesta do teto de paginação. Ver research/autouncle-investigacao.md.
//   • default : uma query (marca opcional via --brand), até `maxPages` páginas (amostra).
//   • --full  : uma query por marca (semeadas do config), cada uma até `maxPages`/teto.
//
// STEALTH: 4 domínios (de/it/es/uk) têm Cloudflare ativo e devolvem 403 a HTTP puro. Marcados com
// `stealth: true` na tabela MARKETS, são servidos por um transporte browser (autouncle/stealth.ts,
// daemon Camoufox) — só o transporte muda; o parse/checkpoint é o mesmo. Uma StealthBridge por run
// serve todos os mercados stealth (uma sessão resolve o challenge de cada domínio à 1.ª visita) e é
// fechada no fim. `--stealth` força o browser mesmo nos 10 abertos; `--http-only` desliga o browser
// (os stealth ficam a 0, isolados). ISOLAMENTO POR MERCADO mantém-se: uma falha num domínio esgota
// os retries e o loop passa ao seguinte.

import { parseListingPage, listingUrl, parseBrands, recordId } from './parse.ts';
import { marketBase, marketSourceSite, CONFIG_PATH, type Market } from './http.ts';
import { StealthBridge, StealthHttpClient } from './stealth.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import type { AutouncleRecord } from './schema.ts';

const CAP_PAGINAS = 120;   // salvaguarda dura (o site esgota antes, ~100 → 404 → página vazia → break)

// Estatísticas acumuladas ao longo do crawl (por mercado).
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
  markets: Market[];
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
  stealth?: boolean;     // --stealth: força o transporte browser mesmo nos mercados HTTP-puros
  httpOnly?: boolean;    // --http-only: nunca usa browser (mercados stealth ficam a 0)
}

// Decide o transporte de um mercado: browser (stealth) vs HTTP puro. `--http-only` desliga o
// browser; `--stealth` liga-o a todos; por default só os mercados marcados `stealth` o usam.
function usaStealth(market: Market, config: CrawlConfig): boolean {
  if (config.httpOnly) return false;
  return Boolean(config.stealth || market.stealth);
}

// Resultado de um mercado (o run-*.ts agrega e relata).
export interface MarketResult {
  code: string;
  sourceSite: string;
  ndjsonPath: string;
  stats: Stats;
  queries: number;
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

// Um mercado: plano de queries (marca única ou --full via config API) → runPagedCrawl.
// `http` é o cliente já resolvido (stealth ou HTTP puro) para este mercado.
async function crawlMarket(market: Market, http: HttpClient, config: CrawlConfig): Promise<MarketResult> {
  const { full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<AutouncleRecord, Stats>({
    outDir, source: `autouncle-${market.code}`, resume, recordId,
    newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (semeadas do config API, densas primeiro). Sem --full: uma só query
  // (marca opcional via --brand).
  let queries: { label: string; brand: string | null; expected?: number }[];
  if (full) {
    const cfg = await http.fetchJson(marketBase(market) + CONFIG_PATH);
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
      const html = await http.fetchText(listingUrl({ market, brand: q.brand, page }), { validate: (t) => t.includes('"@type":"ItemList"') });
      if (!html) return null;                              // falha/404 (teto/anti-bot) → passa à próxima query
      const { listings, total } = parseListingPage(html, { collectedAt, forcedMake: q.brand || null, market });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
    logLine: (q, page, novos, stats) =>
      `  [${market.code}] ${q.label} p${page}: +${novos} novos (total ${stats.records}${q.expected ? `/${q.expected}` : ''})`,
    stop: ({ novos, page }) => novos === 0 && page > 1,   // página sem carros novos (repetição) → fim
  });

  return { code: market.code, sourceSite: marketSourceSite(market), ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}

// config: { http, markets[], full?, brand?, maxPages, outDir, resume?, stealth?, httpOnly? }
export async function crawl(config: CrawlConfig): Promise<{ markets: MarketResult[] }> {
  const results: MarketResult[] = [];
  let bridge: StealthBridge | null = null;   // criada à 1.ª necessidade, partilhada, fechada no fim
  try {
    for (const market of config.markets) {
      const stealth = usaStealth(market, config);
      console.log(`\n— mercado ${market.code} (${marketSourceSite(market)})${stealth ? ' [stealth/browser]' : ''} —`);
      let http: HttpClient;
      if (stealth) {
        if (!bridge) bridge = new StealthBridge({ minDelayMs: config.http.minDelayMs });
        http = new StealthHttpClient(market, bridge);
      } else {
        http = config.http.forMarket(market);
      }
      results.push(await crawlMarket(market, http, config));
    }
  } finally {
    bridge?.close();
  }
  return { markets: results };
}
