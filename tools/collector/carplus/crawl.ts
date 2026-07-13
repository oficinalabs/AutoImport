// carplus/crawl.ts — recolha batch do carplus.pt: paginação, dedupe, checkpoint, NDJSON, stats.
// Mesma forma do autopt/autocasion (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a listagem geral `/carros-usados/` pagina com `?page=N` (16 viaturas/página)
// até ao fim REAL (~1.037 viaturas ≈ 65 páginas; a página a seguir à última vem VAZIA — confirmado
// com p70=0). Verificámos que a **ordem default do SSR é ESTÁVEL** entre pedidos (dois fetches da
// listagem geral devolvem exatamente a mesma sequência de VINs) → paginar a listagem geral de uma
// vez é COMPLETO e fiável. É por isso que `--full` percorre a listagem geral (e NÃO fatiado por
// marca): o path `/carros-usados/{slug}/` só cobre as marcas presentes nos links da 1ª página
// (~28), deixando de fora marcas como alfa-romeo/land-rover/smart/ds → risco de lacuna. O `--brand`
// continua disponível como FILTRO opcional (uma só marca). Dedupe GLOBAL por VIN.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import type { HttpClient } from '../lib/http.ts';
import type { CarplusRecord } from './schema.ts';

const CAP_PAGINAS = 120;   // salvaguarda; na prática a listagem esgota bem antes (páginas vazias)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  byBrand: Record<string, number>;
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

// URL de listagem. `slug` (marca, ex. "audi") fatia via path; page>1 → ?page=N.
function urlListagem(slug: string | null, page: number) {
  const path = slug ? `/carros-usados/${slug}/` : '/carros-usados/';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

// Só aceitamos a resposta se trouxer o payload Nuxt (evita páginas de erro/anti-bot 200-vazio).
const temPayload = (t: string) => t.includes('__NUXT_DATA__');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, byBrand: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: CarplusRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byBrand[r.make || '?'] = (stats.byBrand[r.make || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'carplus-checkpoint.json');

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `carplus-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // Uma só query: a listagem geral (`--full` só distingue quantas páginas percorrer, via maxPages) ou,
  // com --brand, a fatia dessa marca (path). O fim é detetado pela 1ª página vazia.
  const queries = [{ label: brand || 'carros-usados', slug: brand }];
  if (full) console.log(`--full: a percorrer a listagem geral até ao fim (até ${Math.min(maxPages, CAP_PAGINAS)} páginas)`);

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.slug, page);
      const html = await http.fetchText(url, { validate: temPayload });
      if (!html) break;
      const { listings, total } = parseListingPage(html, { collectedAt });
      if (page === 1) stats.nbResults[q.label] = total;
      if (!listings.length) break;                         // fim dos resultados (página vazia)
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
