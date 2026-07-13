// quoka/crawl.ts — recolha batch do quoka.de: paginação, dedupe, checkpoint, NDJSON. Mesma
// forma do autocasion/autoboerse (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a paginação da listagem geral (`/automarkt/?pag=N`, 20/pág) satura muito
// antes do total declarado. Para cobrir mais, fatiamos por MARCA usando as páginas de marca
// `/anzeigen/auto-motorrad/automarkt/{marca}/?pag=N` (ex. .../automarkt/volkswagen/). Os slugs de
// marca vêm dos links da 1ª página (filtrando os 16 Bundesländer), por isso o --full arranca com
// uma sondagem. Marcas densas (VW/BMW/Mercedes) podem ainda saturar o cap; o corte fino seguinte
// seria por marca+região (não implementado — ver README).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.ts';
import type { HttpClient } from '../lib/http.ts';
import type { QuokaRecord } from './schema.ts';

const CAP_PAGINAS = 500;   // salvaguarda; na prática a listagem esgota/repete antes

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  byMake: Record<string, number>;
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

// URL de listagem. `brand` (slug, ex. "volkswagen") fatia via path; page>1 acrescenta ?pag=N.
function urlListagem(brand: string | null, page: number) {
  const path = brand ? `/anzeigen/auto-motorrad/automarkt/${brand}/` : '/anzeigen/auto-motorrad/automarkt/';
  const qs = page > 1 ? `?pag=${page}` : '';
  return `${BASE}${path}${qs}`;
}

const temCards = (t: string) => t.includes('article-item');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, byMake: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: QuokaRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'quoka-checkpoint.json');

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `quoka-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por marca (descobre os slugs na 1ª página). Sem --full: uma só query (com
  // marca opcional via --brand). `brand`/slug serve de brandHint (fixa a marca no schema).
  let queries: { label: string; brand: string | null }[];
  if (full) {
    const probe = await http.fetchText(urlListagem(brand, 1), { validate: temCards });
    const slugs = probe ? extractBrandSlugs(probe) : [];
    queries = slugs.map((s) => ({ label: s, brand: s }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 6).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{ label: brand || 'automarkt', brand }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.brand, page);
      const html = await http.fetchText(url, { validate: temCards });
      if (!html) break;
      const { listings, total } = parseListingPage(html, { collectedAt, brandHint: q.brand });
      if (page === 1) stats.nbResults[q.label] = total;
      if (!listings.length) break;                         // fim dos resultados
      let novos = 0;
      for (const r of listings) {
        const id = recordId(r);
        if (!id || seen.has(id)) continue;                 // dedupe global (Premium repete-se)
        seen.add(id);
        appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
        atualizaStats(stats, r);
        novos++;
      }
      stats.pages++;
      ckpt.doneQueries[q.label] = page;
      saveCkpt();
      console.log(`  ${q.label} p${page}: +${novos} novos (total ${stats.records})`);
      if (novos === 0) break;   // página só com anúncios já vistos → fim útil desta query
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
