// crawl.mjs — orquestração da recolha: plano de queries, paginação, dedupe,
// checkpoint/resume e escrita NDJSON.
//
// PORQUÊ NDJSON: um registo JSON por linha permite escrita incremental (append) e
// leitura em streaming de ficheiros grandes — ideal para recolhas longas.
//
// PORQUÊ fatiar por país×marca (modo --full): a paginação de um país sozinho satura e
// repete; queries mais estreitas dão mais cobertura útil e são mais estáveis.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, readNbResults, recordId } from './parse.mjs';
import { fetchModelSlugs } from './sitemap.mjs';

// Constrói o URL de uma página de listagem. Página 1 não leva número no path.
function urlDaPagina(queryPath, page) {
  return page === 1
    ? `${BASE}/used-cars/${queryPath}.html`
    : `${BASE}/used-cars/${queryPath}/${page}.html`;
}

// Estado inicial das estatísticas (agregação corrida — sem guardar todos os preços).
function statsVazias() {
  return {
    records: 0, pages: 0,
    byCountry: {}, bySource: {},
    price: { count: 0, sum: 0, min: null, max: null },
    nbResults: {},
  };
}

function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  if (r.price > 0) {
    const p = stats.price;
    p.count++; p.sum += r.price;
    p.min = p.min === null ? r.price : Math.min(p.min, r.price);
    p.max = p.max === null ? r.price : Math.max(p.max, r.price);
  }
}

// Recolha principal. `config`: { http, countries[], make?, full?, maxPages, outDir, resume? }.
export async function crawl(config) {
  const { http, countries, make = null, full = false, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'theparking-checkpoint.json');

  // Carrega checkpoint (resume) ou inicia um novo.
  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `theparking-${stamp}.ndjson`),
      doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);          // dedupe global por ID de anúncio
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries -------------------------------------------------
  let queries;
  if (full) {
    const slugs = await fetchModelSlugs(http);
    console.log(`plano completo: ${countries.length} países × ${slugs.length} modelos`);
    queries = countries.flatMap((c) => slugs.map((s) => `${c}/${s}`));
  } else {
    // modo amostra: um path por país (opcionalmente estreitado por marca).
    queries = countries.map((c) => (make ? `${c}/${make}` : c));
  }

  // --- paginação por query ---------------------------------------------
  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q] || 0) + 1;   // retoma onde ficou
    for (let page = startPage; page <= maxPages; page++) {
      const url = urlDaPagina(q, page);
      // validate: a página tem de conter blocos Vehicle; senão, é o Cloudflare a
      // devolver 200 vazio (rate-limit intermitente) → o http faz retry.
      const html = await http.fetchText(url, { validate: (t) => t.includes('"@type": "Vehicle"') });
      if (!html) break;                                  // esgotou retries → passa à query seguinte

      if (page === 1) stats.nbResults[q] = readNbResults(html);

      const recs = parseListingPage(html, { collectedAt });
      if (recs.length === 0) break;                      // fim dos resultados desta query

      let novos = 0;
      for (const r of recs) {
        const id = recordId(r);
        if (!id || seen.has(id)) continue;               // dedupe
        seen.add(id);
        appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
        atualizaStats(stats, r);
        novos++;
      }
      stats.pages++;
      ckpt.doneQueries[q] = page;
      saveCkpt();
      console.log(`  ${q} p${page}: +${novos} novos (total ${stats.records})`);
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
