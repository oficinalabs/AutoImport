// meinauto/crawl.ts — recolha batch do meinauto.de: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autoboerse/crawl.ts (dedupe global por id, checkpoint/resume, stats).
//
// FILTRO OBRIGATÓRIO: `conditionCategories=PRE_OWNED` — o meinauto mistura NOVOS (Neuwagen/Leasing/
// configuráveis) com USADOS; este parâmetro isola os Gebrauchtwagen (~9.100 anúncios com preço/km/
// ano reais). O schema ainda guarda `condition_category` como salvaguarda (deve ser sempre PRE_OWNED).
//
// COBERTURA (--full): AO CONTRÁRIO dos outros coletores, a paginação NÃO satura — a `?page=N` desce
// até ao fim (p194 ≈ offset 9071; p195 vazia), SEM teto de offset. Logo a query única já cobre tudo.
// Mesmo assim, o --full fatia por MARCA (`makes={nome}`) — como o autoboerse — porque dá contagens
// por marca e é mais robusto (partições < ~1.300, muito dentro do cap). As marcas (nomes) vêm das
// facetas `meta.counts.makes` da 1ª página, por isso o --full arranca com uma sondagem. O dedupe
// global apanha qualquer resíduo. Sem --full: uma só query (marca opcional via --brand).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, temNuxtData, recordId } from './parse.ts';
import type { HttpClient } from '../lib/http.ts';
import type { MeinautoRecord } from './schema.ts';

const CAP_PAGINAS = 500;   // salvaguarda; na prática a query esgota antes (páginas vazias)

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

// URL de listagem. `make` (nome, ex. "Audi") fatia via `makes=`; page>1 acrescenta `page=N`.
// A barra final em `/fahrzeugsuche/` é obrigatória (sem ela há 301).
function urlListagem(make: string | null, page: number) {
  const qs = new URLSearchParams({ conditionCategories: 'PRE_OWNED' });
  if (make) qs.set('makes', make);
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/fahrzeugsuche/?${qs}`;
}

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: MeinautoRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'meinauto-checkpoint.json');

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `meinauto-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por marca (descobre os nomes na 1ª página). Sem --full: uma só query
  // (com marca opcional via --brand).
  let queries: { label: string; make: string | null }[];
  if (full) {
    const probe = await http.fetchText(urlListagem(brand, 1), { validate: temNuxtData });
    const makes = probe ? parseListingPage(probe).makes : [];
    queries = makes.map((m) => ({ label: m, make: m }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{ label: brand || 'gebrauchtwagen', make: brand }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.make, page);
      const html = await http.fetchText(url, { validate: temNuxtData });
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
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
