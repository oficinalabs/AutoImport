// autoline/crawl.mjs — recolha batch do autoline.pt: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/crawl.mjs (dedupe global por id, checkpoint/resume, stats).
//
// ÂMBITO: categoria CARROS (ligeiros, `--c1169`) filtrada por PAÍS. Rota de listagem:
// `/-/carros/{Pais}--c1169cnt{CC}?page=N`. Por defeito recolhe a Bélgica (cntBE, ~590 anúncios,
// que a paginação cobre por inteiro — ~26 págs de 23).
//
// COBERTURA (--full): o site NÃO deixa ordenar (`Disallow: /-/*sort=`) e o sidebar de MARCAS é
// truncado ("Ver todas" → endpoint sob `/search/`, proibido). A partição limpa e path-based é por
// PAÍS: o modo --full sonda a página geral da categoria, lê os facets de país europeus
// (DE/BE/ES/FR/GB/CH…) e itera-os — cobrindo TODO o stock UE de ligeiros (cada país pagina até ao
// fim, ~centenas). Sem --full, uma só query (país via --country, default BE).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, extractCountryFacets, recordId } from './parse.mjs';

const CAP_PAGINAS = 500;   // salvaguarda; na prática cada país esgota bem antes (páginas vazias)

// Categoria default: CARROS (passenger cars). slug + id do path `--c{id}`.
const CAT = { slug: 'carros', id: 1169 };

// Fallback de slug (nome PT do país no path) por código ISO — os facets europeus do autoline.pt.
// Usado quando o utilizador passa --country <CC> sem sondar a página.
const SLUG_PT = { BE: 'Belgica', DE: 'Alemanha', ES: 'Espanha', FR: 'Franca', GB: 'Gra-Bretanha', CH: 'Suica' };

// URL de listagem. `country` = { cc, slug } (país) ou null (todos); page>1 acrescenta ?page=N.
function urlListagem(cat, country, page) {
  const seg = country ? `/-/${cat.slug}/${country.slug}--c${cat.id}cnt${country.cc}`
    : `/-/${cat.slug}--c${cat.id}`;
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${seg}${qs}`;
}

const temItemList = (t) => t.includes('ItemList');

function statsVazias() {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, auctions: 0, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, maxId: null };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.is_auction) stats.auctions++;
  if (r.id != null && (stats.maxId === null || String(r.id) > String(stats.maxId))) stats.maxId = r.id;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, country?, maxPages, outDir, resume? }
// country: código ISO (ex. 'BE'); default 'BE'. Ignorado em --full (itera todos os países).
export async function crawl(config) {
  const { http, full = false, country = 'BE', maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autoline-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autoline-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por PAÍS europeu (descobre os facets na página geral da categoria).
  // Sem --full: uma só query, o país pedido (--country, default BE).
  let queries;
  if (full) {
    const probe = await http.fetchText(urlListagem(CAT, null, 1), { validate: temItemList });
    const facets = probe ? extractCountryFacets(probe) : [];
    queries = facets.map((f) => ({ label: f.cc, country: f }));
    if (!queries.length) { // fallback: pelo menos o país pedido
      const cc = String(country).toUpperCase();
      queries = [{ label: cc, country: { cc, slug: SLUG_PT[cc] || cc } }];
    }
    console.log(`--full: ${queries.length} países a percorrer (${queries.map((q) => q.label).join(', ')})`);
  } else {
    const cc = String(country).toUpperCase();
    queries = [{ label: cc, country: { cc, slug: SLUG_PT[cc] || cc } }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(CAT, q.country, page);
      const html = await http.fetchText(url, { validate: temItemList });
      if (!html) break;
      const { listings, total } = parseListingPage(html, { collectedAt, countryCode: q.country?.cc });
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
