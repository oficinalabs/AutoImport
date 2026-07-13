// autouncle/crawl.mjs — recolha batch do autouncle.pt: paginação `?page=N`, dedupe, checkpoint,
// NDJSON. Mesma FORMA do autoboerse (fatiamento por marca, dedupe global, checkpoint/resume, stats).
//
// COBERTURA (--full): o meta-motor indexa ~99 mil anúncios PT, mas a paginação satura por volta da
// página ~100 (25/pág → ~2.500 acessíveis por query; páginas mais fundas dão 404). E — crítico — o
// robots proíbe os SRP com filtros/ordenação por query (`s[...]=`), pelo que NÃO podemos fatiar por
// query. Fatiamos então por MARCA via PATH SEO canónico (`/pt/carros-usados/{Marca}`), com a lista de
// marcas (e contagens) vinda da config API `/api/v4/car_search_form/config` (robots-permitida). Marcas
// abaixo do teto ficam 100%; as ~14 densas (Peugeot/Renault/Mercedes/BMW…, >2.500) ficam pela primeira
// fatia de ~2.500 — limitação honesta do teto de paginação (o slug de modelo do site NÃO mapeia 1:1
// com o config, logo o sub-corte por modelo seria frágil). Ver research/autouncle-investigacao.md.
//   • default : uma query (marca opcional via --brand), até `maxPages` páginas (amostra).
//   • --full  : uma query por marca (semeadas do config), cada uma até `maxPages`/teto.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, listingUrl, parseBrands, recordId } from './parse.mjs';
import { BASE, CONFIG_PATH } from './http.mjs';

const CAP_PAGINAS = 120;   // salvaguarda dura (o site esgota antes, ~100 → 404 → página vazia → break)

function statsVazias() {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byFuel: {}, byGearbox: {},
    byRating: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, minDaysOnMarket: null,
  };
}
function atualizaStats(stats, r) {
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
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autouncle-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autouncle-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por marca (semeadas do config API, densas primeiro). Sem --full: uma só query
  // (marca opcional via --brand).
  let queries;
  if (full) {
    const cfg = await http.fetchJson(BASE + CONFIG_PATH);
    const brands = parseBrands(cfg);
    queries = brands.map((b) => ({ label: b.brand, brand: b.brand, expected: b.count }));
    console.log(`--full: ${queries.length} marcas a percorrer (top: ${queries.slice(0, 5).map((q) => `${q.label}(${q.expected})`).join(', ')}…)`);
    if (!queries.length) { console.warn('  ⚠ config sem marcas — a cair para query única'); queries = [{ label: brand || 'todos', brand }]; }
  } else {
    queries = [{ label: brand || 'todos', brand }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    const forcedMake = q.brand || null;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = listingUrl({ brand: q.brand, page });
      const html = await http.fetchText(url, { validate: (t) => t.includes('"@type":"ItemList"') });
      if (!html) break;                                    // falha/404 (teto) → passa à próxima query
      const { listings, total } = parseListingPage(html, { collectedAt, forcedMake });
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
      console.log(`  ${q.label} p${page}: +${novos} novos (total ${stats.records}${q.expected ? `/${q.expected}` : ''})`);
      if (novos === 0 && page > 1) break;                  // página sem carros novos (repetição) → fim
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
