// olxpt/crawl.mjs — recolha batch do olx.pt: paginação por ?page=N (SSR), dedupe, checkpoint, NDJSON.
// Mesma FORMA do autoboerse (dedupe global por id, checkpoint/resume por query, stats).
//
// COBERTURA (--full): a paginação satura no teto de 100 páginas × 52 ≈ 5 200 (< 50,8 mil). Para cobrir
// tudo, fateia-se por MARCA — path SEO `/carros-motos-e-barcos/carros/{marca}/` (a lista de marcas é o
// seed validado em schema.MAKES, ordenado por densidade). Ao crawlar uma faceta de marca, carimba-se a
// marca da faceta (forcedMake) — mais fiável que detetá-la do título. As 2 marcas mais densas (BMW/
// Mercedes, ~5,5k) passam ligeiramente o teto e truncam nele — limitação documentada (ver README).
//   • default : uma query (secção inteira, ou --make/--region), até `maxPages` páginas.
//   • --full  : uma query por marca (seed), até esgotar cada faceta ou o teto.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, listingUrl, recordId, PAGE_MAX } from './parse.mjs';
import { MAKES, SLUG_TO_NAME } from './schema.mjs';

function statsVazias() {
  return {
    records: 0, pages: 0, byCountry: {}, bySellerType: {}, byMake: {}, byFuel: {}, byRegion: {},
    price: { count: 0, sum: 0, min: null, max: null }, catalogTotal: null, latestCreated: null,
  };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySellerType[r.seller_type || '?'] = (stats.bySellerType[r.seller_type || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  if (r.created_time && (stats.latestCreated === null || r.created_time > stats.latestCreated)) stats.latestCreated = r.created_time;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, make?, region?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, make = null, region = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'olxpt-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `olxpt-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por marca (seed), carimbando a marca da faceta. Sem --full: uma só query
  // (opcionalmente restrita por --make <slug> ou --region <slug>).
  let queries;
  if (full) {
    queries = MAKES.map((m) => ({ label: m.slug, make: m.slug, forcedMake: m.name }));
    console.log(`--full: ${queries.length} marcas a percorrer (top: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{
      label: make || region || 'carros',
      make: make || null,
      region: make ? null : region,
      forcedMake: make ? (SLUG_TO_NAME[make] || null) : null,
    }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages === Infinity ? PAGE_MAX : maxPages, PAGE_MAX); page++) {
      const url = listingUrl({ make: q.make, region: q.region, page });
      const html = await http.fetchListing(url);
      if (!html) break;                                    // falha → passa à próxima query (retoma c/ --resume)
      const { listings, total } = parseListingPage(html, { collectedAt, forcedMake: q.forcedMake });
      if (page === 1 && total != null) stats.catalogTotal = full ? stats.catalogTotal : total;
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
      console.log(`  ${q.label} p${page}${total != null ? `/${Math.min(total, PAGE_MAX * 52)}` : ''}: +${novos} novos (total ${stats.records})`);
      if (novos === 0 && page > 1) break;                  // faceta esgotada (só repetidos)
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
