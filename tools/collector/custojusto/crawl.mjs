// custojusto/crawl.mjs — recolha batch do CustoJusto.pt: fatiamento por faceta, dedupe global,
// checkpoint/resume, NDJSON, stats. Mesma forma do flexicar/autoboerse, MAS adaptada ao facto de a
// PAGINAÇÃO estar robots-proibida (`Disallow: /*?o=*`).
//
// ⚠️ COBERTURA: como não podemos paginar (`?o=N` vedado), cada URL de faceta devolve só a 1ª página
// = 40 anúncios (ordenados por data de publicação, os mais recentes). A unidade de recolha é a
// FACETA path-based (não a página). `--max-pages N` limita o nº de facetas processadas (nome mantido
// por paridade com os outros CLIs).
//   • default : listagem base + fatias por marca (75) + por distrito (20). Seed da 1ª página.
//   • --brand : só `/portugal/veiculos/carros-usados/{marca}`.
//   • --full  : produto cartesiano marca × distrito (75 × 20 = 1500 facetas). Captura os 40 mais
//               recentes de cada (marca, distrito); a união deduplicada cobre uma fração grande dos
//               ~26,4k anúncios. Combos densos (>40) truncam na 1ª página — o corte fino seguinte
//               seria por categoria/preço/ano (não implementado; ver README).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, recordId } from './parse.mjs';

const temNext = (t) => t.includes('__NEXT_DATA__');

// Constrói o path de uma faceta: /{region}/veiculos/carros-usados[/{category}][/{brand}].
function facetPath({ region = 'portugal', category = null, brand = null } = {}) {
  const segs = [region, 'veiculos', 'carros-usados'];
  if (category) segs.push(category);
  if (brand) segs.push(brand);
  return '/' + segs.join('/');
}

function statsVazias() {
  return { records: 0, facets: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// Constrói a lista de facetas a percorrer, conforme o modo. Cada faceta = { label, path, brandHint }.
async function planearFacetas({ http, full, brand }) {
  if (brand) {
    const slug = String(brand).toLowerCase();
    return [{ label: slug, path: facetPath({ brand: slug }), brandHint: slug }];
  }
  // Sondagem à listagem base para semear marcas/distritos (vêm no __NEXT_DATA__).
  const probe = await http.fetchText(`${BASE}${facetPath({})}`, { validate: temNext });
  const { brands, districts } = probe ? parseListingPage(probe) : { brands: [], districts: [] };

  if (full) {
    const facetas = [];
    for (const b of brands) {
      for (const d of districts) {
        facetas.push({ label: `${b.shortName}·${d}`, path: facetPath({ region: d, brand: b.shortName }), brandHint: b.name });
      }
    }
    console.log(`--full: ${facetas.length} facetas marca×distrito (${brands.length} marcas × ${districts.length} distritos; 40 SSR cada, combos densos truncam)`);
    return facetas;
  }
  // default: base + fatias por marca + por distrito.
  const facetas = [{ label: 'base', path: facetPath({}), brandHint: null }];
  for (const b of brands) facetas.push({ label: b.shortName, path: facetPath({ brand: b.shortName }), brandHint: b.name });
  for (const d of districts) facetas.push({ label: d, path: facetPath({ region: d }), brandHint: null });
  console.log(`default: ${facetas.length} facetas (base + ${brands.length} marcas + ${districts.length} distritos)`);
  return facetas;
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'custojusto-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos (${ckpt.doneFacets}/${ckpt.facets.length} facetas feitas)`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const facets = await planearFacetas({ http, full, brand });
    ckpt = { startedAt: stamp, ndjson: join(outDir, `custojusto-${stamp}.ndjson`), facets, doneFacets: 0, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // Percorre até `maxPages` facetas NOVAS (a partir de onde o checkpoint parou). Cada faceta = 1 fetch.
  const inicio = ckpt.doneFacets;
  const fim = Math.min(ckpt.facets.length, inicio + Math.max(1, maxPages));
  for (let i = inicio; i < fim; i++) {
    const f = ckpt.facets[i];
    const html = await http.fetchText(`${BASE}${f.path}`, { validate: temNext });
    ckpt.doneFacets = i + 1;
    if (!html) { saveCkpt(); continue; }
    const { listings, total } = parseListingPage(html, { collectedAt, brandHint: f.brandHint });
    stats.nbResults[f.label] = total;
    let novos = 0;
    for (const r of listings) {
      const id = recordId(r);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
      atualizaStats(stats, r);
      novos++;
    }
    stats.facets++;
    saveCkpt();
    console.log(`  [${i + 1}/${ckpt.facets.length}] ${f.label} (${total ?? '?'} no total) → +${novos} novos (acum ${stats.records})`);
  }

  return { ndjsonPath: ckpt.ndjson, stats, facets: ckpt.facets.length, done: ckpt.doneFacets };
}
