// autoboerse/crawl.ts — recolha batch do autoboerse.de: paginação, dedupe, checkpoint,
// NDJSON. Mesma forma do autotrader/crawl.ts.
//
// COBERTURA (--full): como o AutoTrader, a paginação satura muito antes das 263 mil (18/pág).
// Para cobrir tudo, fatiamos por MARCA — a taxonomia é path-based: /fahrzeugsuche/{marca}?page=N
// (ex. /fahrzeugsuche/volkswagen). A lista de marcas (com contagens) vem no __NEXT_DATA__ da 1ª
// página, por isso o modo --full arranca com uma sondagem para descobrir as marcas. Marcas
// densas (VW/Mercedes/BMW/Audi, dezenas de milhar) podem ainda saturar o cap de paginação; o
// próximo corte fino seria por modelo/preço (não implementado — ver README).

import { parseListingPage, recordId } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutoboerseRecord } from './schema.ts';

const BASE = 'https://autoboerse.de';
const CAP_PAGINAS = 500;   // salvaguarda; na prática o site esgota antes (listings vazios)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
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

// URL de listagem. `brand` (slug, ex. "volkswagen") fatia via path; page>1 acrescenta ?page=N.
function urlListagem(brand: string | null, page: number) {
  const path = brand ? `/fahrzeugsuche/${brand}` : '/fahrzeugsuche';
  const qs = new URLSearchParams();
  if (page > 1) qs.set('page', String(page));
  const q = qs.toString();
  return `${BASE}${path}${q ? `?${q}` : ''}`;
}

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: AutoboerseRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<AutoboerseRecord, Stats>({
    outDir, source: 'autoboerse', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (descobre-as na 1ª página). Sem --full: uma só query (com
  // marca opcional via --brand).
  let queries: { label: string; brand: string | null }[];
  if (full) {
    const probe = await http.fetchText(urlListagem(brand, 1), { validate: (t) => t.includes('__NEXT_DATA__') });
    const brands = probe ? parseListingPage(probe).brands : [];
    queries = brands
      .filter((b) => b?.text)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((b) => ({ label: String(b.text), brand: String(b.text) }));
    console.log(`--full: ${queries.length} marcas a percorrer (top: ${queries.slice(0, 4).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{ label: brand || 'fahrzeugsuche', brand }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.brand, page), { validate: (t) => t.includes('__NEXT_DATA__') });
      if (!html) return null;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
