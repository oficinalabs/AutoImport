// ocasionplus/crawl.ts — recolha batch do ocasionplus.com: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/crawl.ts (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a paginação da listagem geral (/coches-segunda-mano?page=N, 20/pág) satura
// antes dos ~13.700 anúncios. Para cobrir tudo, fatiamos por MARCA usando as landing-pages de path
// `/coches-segunda-mano/{marca}` (ex. .../audi → só AUDI, pagina com ?page=N). Os slugs de marca
// vêm da página `/marcas`, por isso o modo --full arranca com uma sondagem. Marcas densas
// (Volkswagen/Seat/Peugeot) podem ainda saturar o cap; o corte fino seguinte seria por modelo
// (path `/{marca}/{modelo}`, também disponível) — não implementado (ver README).
//
// ⚠️ IMPORTANTE (robots): NÃO usamos filtros por query (?marca=, ?sort=, …) — estão TODOS proibidos
// no robots.txt. Fatiamos só por PATH e paginamos com ?page=N (permitido).

import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OcasionplusRecord } from './schema.ts';

const CAP_PAGINAS = 800;   // salvaguarda; na prática a listagem esgota antes (páginas vazias)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  byRegion: Record<string, number>;
  byCenter: Record<string, number>;
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

// URL de listagem. `brand` (slug, ex. "audi") fatia via path; page>1 acrescenta ?page=N.
function urlListagem(brand: string | null, page: number) {
  const path = brand ? `/coches-segunda-mano/${brand}` : '/coches-segunda-mano';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

const temVehicle = (t: string) => t.includes('"@type":"Vehicle"');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, byRegion: {}, byCenter: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: OcasionplusRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byCenter[r.center || '?'] = (stats.byCenter[r.center || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<OcasionplusRecord, Stats>({
    outDir, source: 'ocasionplus', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (descobre os slugs em /marcas). Sem --full: uma só query (com marca
  // opcional via --brand).
  let queries: { label: string; brand: string | null }[];
  if (full) {
    const probe = await http.fetchText(`${BASE}/marcas`);
    const slugs = probe ? extractBrandSlugs(probe) : [];
    queries = slugs.map((s) => ({ label: s, brand: s }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{ label: brand || 'coches-segunda-mano', brand }];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.brand, page), { validate: temVehicle });
      if (!html) return null;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
    stop: ({ novos, page, startPage }) => !novos && page > startPage,   // página sem novos → provável fim/repetição
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
