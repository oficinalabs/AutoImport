// ooyyo/crawl.ts — recolha batch do Ooyyo (secção BE): seed via API, paginação por "Next",
// dedupe, checkpoint, NDJSON. Mesma forma do autocasion/crawl.ts (dedupe global por id,
// checkpoint/resume, stats), adaptada à navegação do Ooyyo:
//
//  1) SEED: a listagem só se alcança pela API `quicksearch/qselements` (ver parse.qselementsUrl),
//     que devolve o URL da 1ª SRP (com `code` válido) + o total + as marcas. Sem --full/--make é
//     uma só query (toda a Bélgica). Com --make, filtra por marca. Com --full, uma query por marca.
//  2) PAGINAÇÃO: seguimos o link "Next" de cada SRP (o `code` codifica a página). Paramos quando
//     não há Next, quando `maxPages` é atingido, ou quando a página não traz registos novos.
//
// COBERTURA (--full): a listagem geral (~72 mil, 15/pág) satura muito antes de se esgotar. Para
// cobrir mais, fatiamos por MARCA (idMake da qselements). Marcas densas (BMW ~9k, Mercedes ~8.7k)
// podem ainda ser grandes; o corte fino seguinte seria por modelo/preço (não implementado — ver
// README). ⚠️ Crawl-delay: 30 do robots.txt → a recolha é lenta por desígnio (honramos o site).

import { qselementsUrl, parseQsElements, parseListingPage, recordId } from './parse.ts';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OoyyoRecord } from './schema.ts';
import type { OoyyoMake, QsResult } from './parse.ts';

const CAP_PAGINAS = 5000;   // salvaguarda dura (72k/15 ≈ 4.8k págs); na prática paramos antes.
const ehJson = (t: string) => t.includes('"makes"') || t.includes('"url"');
const ehSrp = (t: string) => t.includes('car-card-1') || t.includes('used-cars-for-sale');

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  byCategory: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
}

// Estado por query (paginação por "Next", retomável).
interface QueryState { pages: number; nextUrl: string | null; seedUrl: string | null; done: boolean }

// Cursor persistido (checkpoint) para retomar (--resume): o estado por query.
type NextCursor = Record<string, QueryState>;

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  make?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// Query do plano de recolha (toda a Bélgica ou por marca).
interface Query { label: string; idMake: string | null; total?: number }

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, byCategory: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: OoyyoRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byCategory[r.category || '?'] = (stats.byCategory[r.category || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// Chama a API qselements (opcionalmente com idMake) → { seedUrl, total, makes }.
async function fetchSeed(http: HttpClient, idMake: string | null = null): Promise<QsResult> {
  const url = qselementsUrl(idMake ? { idMake } : {});
  const txt = await http.fetchText(url, { validate: ehJson });
  return txt ? parseQsElements(txt) : { seedUrl: null, total: null, makes: [] };
}

// Resolve --make (nome/slug) → idMake, consultando a lista de marcas da qselements.
function resolveMake(makes: OoyyoMake[], wanted: string): OoyyoMake | null {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[+\s_-]+/g, ' ').trim();
  const w = norm(wanted);
  return makes.find((m) => norm(m.name) === w || norm(m.urlName) === w)
    || makes.find((m) => norm(m.name).startsWith(w) || norm(m.urlName).startsWith(w))
    || null;
}

// config: { http, full?, make?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, make = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<OoyyoRecord, Stats>({
    outDir, source: 'ooyyo', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
    resumeLog: ({ stats }) => `↻ resume: ${stats.records} registos já recolhidos`,
  });
  const stats = writer.stats;

  let cursor = writer.cursor as NextCursor | null;
  if (!cursor) cursor = {};

  // --- plano de queries (cada uma com o seu seedUrl da API) ---
  let queries: Query[];
  if (full) {
    const { makes } = await fetchSeed(http);
    const ordenadas = makes.sort((a, b) => (b.count || 0) - (a.count || 0));
    queries = ordenadas.map((m) => ({ label: m.name, idMake: m.idMake, total: m.count }));
    console.log(`--full: ${queries.length} marcas a percorrer (top: ${queries.slice(0, 4).map((q) => `${q.label}(${q.total})`).join(', ')}…)`);
  } else if (make) {
    const { makes } = await fetchSeed(http);
    const hit = resolveMake(makes, make);
    if (!hit) { console.warn(`⚠ marca "${make}" não encontrada; a usar toda a Bélgica.`); queries = [{ label: 'belgium', idMake: null }]; }
    else queries = [{ label: hit.name, idMake: hit.idMake, total: hit.count }];
  } else {
    queries = [{ label: 'belgium', idMake: null }];
  }

  for (const q of queries) {
    const qs = (cursor[q.label] ||= { pages: 0, nextUrl: null, seedUrl: null, done: false });
    if (qs.done) { console.log(`  ${q.label}: já completo (resume) — ${qs.pages} págs`); continue; }

    // URL de arranque: retoma pelo nextUrl guardado, ou (re)obtém o seed pela API.
    let url = qs.pages > 0 && qs.nextUrl ? qs.nextUrl : null;
    if (!url) {
      const seed = await fetchSeed(http, q.idMake);
      if (!seed.seedUrl) { console.warn(`  ⚠ ${q.label}: sem seedUrl (API falhou) — a saltar`); continue; }
      qs.seedUrl = seed.seedUrl;
      if (seed.total != null) stats.nbResults[q.label] = seed.total;
      url = seed.seedUrl;
    }

    let pagina = qs.pages;
    while (url && pagina < Math.min(maxPages, CAP_PAGINAS)) {
      const html = await http.fetchText(url, { validate: ehSrp });
      if (!html) break;
      const { listings, nextUrl } = parseListingPage(html, { collectedAt: writer.collectedAt });
      pagina++;
      let novos = 0;
      for (const r of listings) if (writer.add(r)) novos++;
      stats.pages++;
      qs.pages = pagina;
      qs.nextUrl = nextUrl;
      if (!nextUrl) qs.done = true;                       // última página (sem Next)
      writer.save(cursor);
      console.log(`  ${q.label} p${pagina}: +${novos} novos (total ${stats.records})`);
      if (!nextUrl) break;                                 // fim da marca/query
      if (novos === 0 && listings.length) { qs.done = true; writer.save(cursor); break; } // saturou (tudo repetido)
      url = nextUrl;
    }
  }

  return { ndjsonPath: writer.ndjsonPath, stats, queries: queries.length };
}
