// autopt/crawl.mjs — recolha batch do auto.pt: paginação, dedupe, checkpoint, NDJSON, stats.
// Mesma forma do autocasion/crawl.mjs (dedupe global por id, checkpoint/resume, stats).
//
// COBERTURA (--full): a listagem geral `/carros-usados` pagina com `?page=N` até ao fim REAL
// (~813 páginas × 20 = 16.241 carros usados; a última página traz 1 card, as seguintes ficam
// vazias — confirmado). Ainda assim, à imagem do autocasion, o `--full` FATIA por MARCA via o path
// `/carros-usados/{slug}` (slugs vindos do `<select name="search[make]">` da 1ª página, ~130) — é
// mais robusto contra qualquer teto silencioso de paginação e permite retoma marca-a-marca. Cada
// marca tem < ~2.100 carros (< 105 páginas). Slices alternativos: `--make` e `--district` (path).
// ⚠️ Os filtros por query `search[...]` devolvem 500 (form POST) → só path + `?page=N`.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, extractMakeSlugs, recordId } from './parse.mjs';

const CAP_PAGINAS = 900;   // salvaguarda; na prática a listagem esgota antes (páginas vazias)

// URL de listagem. `slug` (marca ou distrito, ex. "renault"/"lisboa") fatia via path; page>1 → ?page=N.
function urlListagem(slug, page) {
  const path = slug ? `/carros-usados/${slug}` : '/carros-usados';
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

const temCards = (t) => t.includes('car_listing_entry');

function statsVazias() {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, byOwner: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byOwner[r.owner_type || '?'] = (stats.byOwner[r.owner_type || '?'] || 0) + 1;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, make?, district?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, make = null, district = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autopt-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autopt-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // --full: uma query por marca (descobre os slugs na 1ª página). Sem --full: uma só query, com
  // slice opcional por --make ou --district (path).
  let queries;
  if (full) {
    const probe = await http.fetchText(urlListagem(null, 1), { validate: temCards });
    const slugs = probe ? extractMakeSlugs(probe) : [];
    queries = slugs.map((s) => ({ label: s, slug: s }));
    console.log(`--full: ${queries.length} marcas a percorrer (ex.: ${queries.slice(0, 6).map((q) => q.label).join(', ')}…)`);
  } else {
    const slug = make || district || null;
    queries = [{ label: slug || 'carros-usados', slug }];
  }

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= Math.min(maxPages, CAP_PAGINAS); page++) {
      const url = urlListagem(q.slug, page);
      const html = await http.fetchText(url, { validate: temCards });
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
