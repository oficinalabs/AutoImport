// trovit/crawl.ts — recolha batch do coches.trovit.es: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/crawl.ts (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): o Trovit NÃO expõe uma página "todos os coches" (rota `/coches` dá 404) —
// só facetas SEO `/coches/{slug}`. Para cobrir o catálogo, fatiamos por MARCA (`MARCAS` em
// parse.ts): cada marca é `/coches/{marca}` e pagina no PATH (`/coches/{marca}/{N}`). Marcas
// densas (Audi ~26k, Citroën ~22k, a 25/pág) podem saturar o cap de paginação; o corte fino
// seguinte seria por marca+modelo/região (o site expõe esses slugs, ex. `/coches/audi-a3`,
// `/coches/audi-madrid`) — não implementado (ver README).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId, MARCAS, DEFAULT_SLUG } from './parse.ts';
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

// Estado persistido (checkpoint) para retomar (--resume).
interface Checkpoint {
  startedAt: string;
  ndjson: string;
  doneQueries: Record<string, number>;
  seen: string[];
  stats: Stats;
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
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'trovit-checkpoint.json');

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `trovit-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

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

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.slug, page);
      const html = await http.fetchText(url, { validate: temCards });
      if (!html) break;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) stats.nbResults[q.label] = total;
      if (!listings.length) break;                         // fim dos resultados
      let novos = 0;
      for (const r of listings) {
        const id = recordId(r);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
        atualizaStats(stats, r);
        novos++;
      }
      stats.pages++;
      ckpt.doneQueries[q.label] = page;
      saveCkpt();
      console.log(`  ${q.label} p${page}: +${novos} novos (total ${stats.records})`);
      if (novos === 0) break;                              // página repetida → marca esgotada
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
