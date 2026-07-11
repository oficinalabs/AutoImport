// aramisauto/crawl.mjs — recolha batch do aramisauto.com: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/autoboerse (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a listagem geral `/achat/?page=N` (24/pág) PAGINA ATÉ AO FIM sem teto — a
// página seguinte ao último resultado devolve 404 (verificado: p100 ok, p130 = 404). Como o
// catálogo é pequeno (~2.871), o --full podia até ser só paginar `/achat/` até esgotar. Ainda
// assim, para fidelidade ao molde e robustez, o --full FATIA por CATEGORIA (silos SEO
// `/achat/{categoria}/`), que particionam o catálogo (as contagens do facet `categoryId` somam
// exatamente o total). Cada silo pagina com `?page=N`; o dedupe global apanha qualquer resíduo.
// `--slice <silo>` faz uma só query a `/achat/{silo}/` (categoria, combustível, `occasion`, `neuves`).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, recordId, temNuxt, CATEGORIAS } from './parse.mjs';

const CAP_PAGINAS = 200;   // salvaguarda; na prática a listagem esgota antes (404 → páginas vazias)

// URL de listagem. `slice` (silo SEO, ex. "diesel" ou "4x4-et-suv") fatia via path; page>1 → ?page=N.
function urlListagem(slice, page) {
  const path = slice ? `/achat/${slice}/` : '/achat/';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

function statsVazias() {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, byOfferType: {}, byCategory: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, maxId: null };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byOfferType[r.offer_type || '?'] = (stats.byOfferType[r.offer_type || '?'] || 0) + 1;
  stats.byCategory[r.category || '?'] = (stats.byCategory[r.category || '?'] || 0) + 1;
  const idNum = Number(r.id);
  if (Number.isFinite(idNum)) stats.maxId = stats.maxId === null ? idNum : Math.max(stats.maxId, idNum);
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, slice?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, slice = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'aramisauto-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `aramisauto-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por categoria (silos que particionam o catálogo). Sem --full: uma só query
  // (com silo opcional via --slice).
  let queries;
  if (full) {
    queries = CATEGORIAS.map((c) => ({ label: c, slice: c }));
    console.log(`--full: ${queries.length} categorias a percorrer (${queries.map((q) => q.label).join(', ')})`);
  } else {
    queries = [{ label: slice || 'achat', slice }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.slice, page);
      const html = await http.fetchText(url, { validate: temNuxt });
      if (!html) break;                                    // 404 (fim) ou falha → passa à query seguinte
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
