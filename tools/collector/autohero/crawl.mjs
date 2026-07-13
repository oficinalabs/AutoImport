// autohero/crawl.mjs — recolha batch do autohero.com: paginação por offset (API), dedupe,
// checkpoint, NDJSON. Mesma FORMA do aramisauto/autoboerse (dedupe global por id, checkpoint/resume,
// stats), mas a unidade de recolha é uma PÁGINA DA API (limit=100), não uma página HTML.
//
// COBERTURA: a API pagina por `offset` de forma estável (sort `newest_eligible`, determinístico) →
// iterar offset 0,100,200,… até `total` cobre TODO o catálogo (~7,4k no DE) em ~75 pedidos, sem
// facetas nem lacunas (o dedupe global apanha qualquer resíduo de borda). Por isso NÃO precisamos do
// truque de facetas do Flexicar: aqui a própria API é paginável e robots-permitida.
//   • default : pagina até `maxPages` páginas (amostra).
//   • --full  : pagina até esgotar o `total` (catálogo completo).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildVariables, parseAdsResponse, recordId, LIMIT_MAX, SORT_RECENTE } from './parse.mjs';

const CAP_PAGINAS = 2000;   // salvaguarda dura (a paginação esgota bem antes, ao chegar ao total)

function statsVazias() {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byFuel: {}, byGearbox: {},
    price: { count: 0, sum: 0, min: null, max: null }, total: null, latestPublished: null,
  };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byGearbox[r.gearbox || '?'] = (stats.byGearbox[r.gearbox || '?'] || 0) + 1;
  const pub = r.listing_first_published_at;
  if (pub && (stats.latestPublished === null || pub > stats.latestPublished)) stats.latestPublished = pub;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, maxPages, outDir, resume?, sort? }
export async function crawl(config) {
  const { http, full = false, maxPages = 5, outDir, resume = false, sort = SORT_RECENTE } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autohero-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos (página ${ckpt.donePages})`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autohero-${stamp}.ndjson`), sort, donePages: 0, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // Nº de páginas a percorrer nesta invocação: --full → até ao total (descoberto na 1ª página);
  // sem --full → `maxPages`. Começamos onde o checkpoint parou.
  for (let page = ckpt.donePages; page < CAP_PAGINAS; page++) {
    if (!full && page >= maxPages) break;
    const offset = page * LIMIT_MAX;
    if (stats.total !== null && offset >= stats.total) break;   // esgotou o catálogo
    const ads = await http.postGraphql(buildVariables({ offset, limit: LIMIT_MAX, sort: ckpt.sort }));
    if (!ads) break;                                            // falha → para (retoma com --resume)
    const { listings, total } = parseAdsResponse(ads, { collectedAt });
    if (page === 0) stats.total = total;
    if (!listings.length) break;                                // fim dos resultados
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
    ckpt.donePages = page + 1;
    saveCkpt();
    console.log(`  pág ${page + 1} (offset ${offset}): +${novos} novos (acum ${stats.records}/${stats.total ?? '?'})`);
  }

  return { ndjsonPath: ckpt.ndjson, stats };
}
