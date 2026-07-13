// caetano/crawl.mjs — recolha batch da Caetano: paginação por página da API, dedupe, checkpoint,
// NDJSON, stats. Mesma FORMA do autohero/crawl.mjs (a unidade de recolha é uma PÁGINA DA API,
// não uma página HTML), com filtro de carros usados no parse.
//
// COBERTURA: a API pagina de forma estável por `page` (ordem default) → iterar page 1,2,3,… até ao
// `maxPage` cobre TODO o stock (~3,2k viaturas → ~13 páginas de 250; ~2,3k depois de filtrar só
// carros usados). O dedupe global por VIN apanha qualquer resíduo de borda. Não é preciso fatiar por
// marca (volume pequeno, uma só query paginável).
//   • default : pagina até `maxPages` páginas (amostra).
//   • --full  : pagina até esgotar o `maxPage` da API (catálogo completo).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSearchResponse, recordId, PAGE_SIZE } from './parse.mjs';

const CAP_PAGINAS = 200;   // salvaguarda dura (a paginação esgota bem antes, ao chegar ao maxPage)

function statsVazias() {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byMake: {}, byRegion: {}, byFuel: {},
    byUsedType: {}, price: { count: 0, sum: 0, min: null, max: null }, rawTotal: null, latestUpdate: null,
  };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byUsedType[r.used_type || '?'] = (stats.byUsedType[r.used_type || '?'] || 0) + 1;
  if (r.update_time && (stats.latestUpdate === null || r.update_time > stats.latestUpdate)) stats.latestUpdate = r.update_time;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'caetano-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} carros já recolhidos (página ${ckpt.donePages})`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `caetano-${stamp}.ndjson`), donePages: 0, maxPage: null, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // page da API é 1-indexed. Começamos onde o checkpoint parou (donePages = nº de páginas já feitas).
  for (let done = ckpt.donePages; done < CAP_PAGINAS; done++) {
    if (!full && done >= maxPages) break;
    const page = done + 1;
    if (ckpt.maxPage !== null && page > ckpt.maxPage) break;      // esgotou o catálogo (--full)
    const json = await http.postSearch({ page, numberElements: PAGE_SIZE });
    if (!json) break;                                             // falha → para (retoma com --resume)
    const { listings, rawTotal, maxPage, raw } = parseSearchResponse(json, { collectedAt });
    if (done === 0) { stats.rawTotal = rawTotal; ckpt.maxPage = maxPage; }
    if (!raw) break;                                              // página vazia = fim dos resultados
    let novos = 0;
    for (const r of listings) {                                   // listings = só carros usados
      const id = recordId(r);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
      atualizaStats(stats, r);
      novos++;
    }
    stats.pages++;
    ckpt.donePages = page;
    saveCkpt();
    console.log(`  pág ${page}/${ckpt.maxPage ?? '?'}: +${novos} carros usados (de ${raw} viaturas na página · acum ${stats.records})`);
  }

  return { ndjsonPath: ckpt.ndjson, stats };
}
