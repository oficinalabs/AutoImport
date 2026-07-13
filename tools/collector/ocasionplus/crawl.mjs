// ocasionplus/crawl.mjs — recolha batch do ocasionplus.com: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/crawl.mjs (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a paginação da listagem geral (/coches-segunda-mano?page=N, 20/pág) satura
// antes dos ~13.700 anúncios. Para cobrir tudo, fatiamos por MARCA usando as landing-pages de path
// `/coches-segunda-mano/{marca}` (ex. .../audi → só AUDI, pagina com ?page=N). Os slugs de marca
// vêm da página `/marcas`, por isso o modo --full arranca com uma sondagem. Marcas densas
// (Volkswagen/Seat/Peugeot) podem ainda saturar o cap; o corte fino seguinte seria por modelo
// (path `/{marca}/{modelo}`, também disponível) — não implementado (ver README).
//
// ⚠️ IMPORTANTE (robots): NÃO usamos filtros por query (?marca=, ?sort=, …) — estão TODOS proibidos
// no robots.txt. Fatiamos só por PATH e paginamos com ?page=N (permitido).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.mjs';

const CAP_PAGINAS = 800;   // salvaguarda; na prática a listagem esgota antes (páginas vazias)

// URL de listagem. `brand` (slug, ex. "audi") fatia via path; page>1 acrescenta ?page=N.
function urlListagem(brand, page) {
  const path = brand ? `/coches-segunda-mano/${brand}` : '/coches-segunda-mano';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

const temVehicle = (t) => t.includes('"@type":"Vehicle"');

function statsVazias() {
  return { records: 0, pages: 0, byCountry: {}, byRegion: {}, byCenter: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byCenter[r.center || '?'] = (stats.byCenter[r.center || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'ocasionplus-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `ocasionplus-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por marca (descobre os slugs em /marcas). Sem --full: uma só query (com marca
  // opcional via --brand).
  let queries;
  if (full) {
    const probe = await http.fetchText(`${BASE}/marcas`);
    const slugs = probe ? extractBrandSlugs(probe) : [];
    queries = slugs.map((s) => ({ label: s, brand: s }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 5).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = [{ label: brand || 'coches-segunda-mano', brand }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.brand, page);
      const html = await http.fetchText(url, { validate: temVehicle });
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
      if (!novos && page > startPage) break;               // página sem novos → provável fim/repetição
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, queries: queries.length };
}
