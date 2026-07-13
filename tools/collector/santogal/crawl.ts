// santogal/crawl.ts — recolha batch do santogal.pt: paginação, dedupe, checkpoint, NDJSON, stats.
// Mesma forma do autopt/crawl.ts (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a listagem de usados `/pt/search-page/?querytext=Usados&vehicletype=car`
// pagina com `?pagina=N` até ao fim REAL (~39 páginas × 40 = ~1.538 usados; a última traz ~30
// cards, as seguintes ficam VAZIAS — confirmado). Como o universo é PEQUENO (só ~39 páginas), o
// `--full` PAGINA TUDO numa só query (ao contrário do autopt/autocasion, que fatiam por marca por
// serem 16k/122k). Slice opcional por MARCA via `--make {MARCA}`: o site combina os termos do
// `querytext` em AND, logo `querytext=Usados BMW` devolve só BMW usados (confirmado). Os filtros
// por faceta (cor/ano/preço) são aplicados via JS/AJAX → não usáveis num GET puro.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import type { HttpClient } from '../lib/http.ts';
import type { SantogalRecord } from './schema.ts';

const CAP_PAGINAS = 80;   // salvaguarda; na prática a listagem esgota antes (~39 páginas, depois vazias)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  byCondition: Record<string, number>;
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
  make?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// URL de listagem. `make` (nome da marca, ex. "BMW") fatia via AND no querytext; page>1 → &pagina=N.
function urlListagem(make: string | null, page: number) {
  const termos = make ? `Usados ${make}` : 'Usados';
  const qs = `querytext=${encodeURIComponent(termos)}&vehicletype=car${page > 1 ? `&pagina=${page}` : ''}`;
  return `${BASE}/pt/search-page/?${qs}`;
}

const temCards = (t: string) => t.includes('card_car');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byFuel: {}, byCondition: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: SantogalRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byCondition[r.condition || '?'] = (stats.byCondition[r.condition || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, make?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, make = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'santogal-checkpoint.json');

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `santogal-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // Uma única query (todos os usados, ou só uma marca com --make). O --full apenas alarga o teto
  // de páginas para cobrir as ~39 (o universo é pequeno; não é preciso fatiar por marca).
  const label = make ? String(make) : 'usados';
  const queries = [{ label, make: make ? String(make) : null }];
  const teto = full ? CAP_PAGINAS : Math.min(maxPages, CAP_PAGINAS);

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= teto; page++) {
      const url = urlListagem(q.make, page);
      const html = await http.fetchText(url, { validate: temCards });
      if (!html) break;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) stats.nbResults[q.label] = total;
      if (!listings.length) break;                         // fim dos resultados (páginas vazias)
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
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
