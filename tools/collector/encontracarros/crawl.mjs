// encontracarros/crawl.mjs — recolha batch do encontracarros.pt: enumera o sitemap, busca cada
// página de detalhe, deduplica, guarda checkpoint, escreve NDJSON e agrega stats.
//
// ARQUITETURA (ver research/encontracarros-investigacao.md): a listagem `/pesquisa` é client-side →
// não serve por HTTP puro. Enumeramos pelo **sitemap.xml** (~50k anúncios recentes com `lastmod`,
// ordenados por recência) e buscamos as **páginas de detalhe** `/anuncio/…`, que são SSR e riquíssimas
// (1 request por anúncio).
//
// UNIDADE "página" (--max-pages): como não há paginação de listagem, definimos PAGE_SIZE detalhes = 1
// "página" (mantém a convenção dos outros CLIs). `--max-pages 3` → ~90 anúncios (os mais recentes).
// --full percorre o sitemap todo. Slices: `--brand` (prefixo do slug), `--district` (token antes do
// id), `--since <ISO>` (só lastmod mais recente).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDetail, recordId } from './parse.mjs';
import { fetchSitemap, districtSlugFromUrl } from './sitemap.mjs';

export const PAGE_SIZE = 30;         // anúncios (páginas de detalhe) por "página" lógica
const CAP_ANUNCIOS = 60000;          // salvaguarda (o sitemap tem ~50k)

// A página de detalhe é válida se trouxer o JSON-LD Vehicle ou o objeto carListing.
const detalheValido = (t) => t.includes('"@type":"Vehicle"') || t.includes('"carListing"');

function statsVazias() {
  return { records: 0, pages: 0, fetched: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {},
    byNational: {}, price: { count: 0, sum: 0, min: null, max: null }, total: null };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byNational[r.national || '?'] = (stats.byNational[r.national || '?'] || 0) + 1;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, district?, since?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, brand = null, district = null, since = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'encontracarros-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos (${ckpt.seen.length} ids vistos)`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `encontracarros-${stamp}.ndjson`), cursor: 0, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- enumeração: sitemap (já ordenado por lastmod DESC) + filtros de slice ---
  console.log('a obter o sitemap.xml…');
  let entries = await fetchSitemap(http);
  stats.total = entries.length;
  console.log(`sitemap: ${entries.length} anúncios (mais recentes primeiro)`);
  if (brand) {
    const b = brand.toLowerCase();
    // `startsWith("{b}-")` apanha marcas de várias palavras (mercedes → mercedes-benz/mercedes-amg).
    entries = entries.filter((e) => e.brandSlug === b || e.brandSlug?.startsWith(`${b}-`));
  }
  if (district) entries = entries.filter((e) => districtSlugFromUrl(e.url)?.startsWith(district.toLowerCase()));
  if (since) entries = entries.filter((e) => e.lastmod && e.lastmod >= since);

  // Teto de anúncios a buscar: --full = tudo; senão maxPages × PAGE_SIZE.
  const limite = full ? Math.min(entries.length, CAP_ANUNCIOS) : Math.min(entries.length, maxPages * PAGE_SIZE);
  console.log(`plano: ${limite} páginas de detalhe a buscar${full ? ' (MODO COMPLETO)' : ` (${maxPages} × ${PAGE_SIZE})`}`
    + `${brand ? ` | marca ${brand}` : ''}${district ? ` | distrito ${district}` : ''}${since ? ` | desde ${since}` : ''}\n`);

  // --- busca anúncio a anúncio, a partir do cursor (permite --resume) ---
  for (let i = ckpt.cursor; i < limite; i++) {
    const e = entries[i];
    if (!e) break;
    ckpt.cursor = i + 1;
    if (seen.has(e.id)) { if (i % 50 === 0) saveCkpt(); continue; }   // dedupe global por id

    const html = await http.fetchText(e.url, { validate: detalheValido });
    stats.fetched++;
    if (!html) continue;
    const r = parseDetail(html, { collectedAt, sitemap: e });
    if (!r) continue;
    const id = recordId(r);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
    atualizaStats(stats, r);

    // 1 "página" a cada PAGE_SIZE anúncios buscados → log + checkpoint.
    if (stats.fetched % PAGE_SIZE === 0) {
      stats.pages++;
      saveCkpt();
      console.log(`  p${stats.pages} (${i + 1}/${limite}): ${stats.records} registos · último ${r.source} · ${r.make} ${r.model} €${r.price}`);
    }
  }
  saveCkpt();

  return { ndjsonPath: ckpt.ndjson, stats };
}
