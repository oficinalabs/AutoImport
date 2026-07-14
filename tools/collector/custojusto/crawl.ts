// custojusto/crawl.ts — recolha batch do CustoJusto.pt: fatiamento por faceta, dedupe global,
// checkpoint/resume, NDJSON, stats. Inner-core (seen/append/stats/checkpoint) em lib/crawl.ts;
// aqui o loop PRÓPRIO por faceta (a paginação `?o=N` é robots-proibida → cada faceta = 1 fetch).
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

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import type { CustojustoRecord } from './schema.ts';

const temNext = (t: string) => t.includes('__NEXT_DATA__');

// Uma faceta a percorrer (path-based).
interface Facet { label: string; path: string; brandHint: string | null }

interface Stats {
  records: number;
  facets: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
}

// Cursor persistido (checkpoint): as facetas planeadas + quantas já foram feitas.
interface FacetCursor { facets: Facet[]; doneFacets: number }

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// Constrói o path de uma faceta: /{region}/veiculos/carros-usados[/{category}][/{brand}].
function facetPath({ region = 'portugal', category = null, brand = null }: { region?: string; category?: string | null; brand?: string | null } = {}) {
  const segs = [region, 'veiculos', 'carros-usados'];
  if (category) segs.push(category);
  if (brand) segs.push(brand);
  return '/' + segs.join('/');
}

function statsVazias(): Stats {
  return { records: 0, facets: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats: Stats, r: CustojustoRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// Constrói a lista de facetas a percorrer, conforme o modo. Cada faceta = { label, path, brandHint }.
async function planearFacetas({ http, full, brand }: { http: HttpClient; full: boolean; brand: string | null }): Promise<Facet[]> {
  if (brand) {
    const slug = String(brand).toLowerCase();
    return [{ label: slug, path: facetPath({ brand: slug }), brandHint: slug }];
  }
  // Sondagem à listagem base para semear marcas/distritos (vêm no __NEXT_DATA__).
  const probe = await http.fetchText(`${BASE}${facetPath({})}`, { validate: temNext });
  const { brands, districts } = probe ? parseListingPage(probe) : { brands: [], districts: [] };

  if (full) {
    const facetas: Facet[] = [];
    for (const b of brands) {
      for (const d of districts) {
        facetas.push({ label: `${b.shortName}·${d}`, path: facetPath({ region: d, brand: b.shortName }), brandHint: b.name });
      }
    }
    console.log(`--full: ${facetas.length} facetas marca×distrito (${brands.length} marcas × ${districts.length} distritos; 40 SSR cada, combos densos truncam)`);
    return facetas;
  }
  // default: base + fatias por marca + por distrito.
  const facetas: Facet[] = [{ label: 'base', path: facetPath({}), brandHint: null }];
  for (const b of brands) facetas.push({ label: b.shortName, path: facetPath({ brand: b.shortName }), brandHint: b.name });
  for (const d of districts) facetas.push({ label: d, path: facetPath({ region: d }), brandHint: null });
  console.log(`default: ${facetas.length} facetas (base + ${brands.length} marcas + ${districts.length} distritos)`);
  return facetas;
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<CustojustoRecord, Stats>({
    outDir, source: 'custojusto', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
    resumeLog: ({ stats, cursor }) => {
      const c = cursor as FacetCursor;
      return `↻ resume: ${stats.records} registos já recolhidos (${c.doneFacets}/${c.facets.length} facetas feitas)`;
    },
  });

  // Cursor: no arranque fresco planeamos as facetas; no resume vêm do checkpoint (não re-planeamos).
  let cursor = writer.cursor as FacetCursor | null;
  if (!cursor) cursor = { facets: await planearFacetas({ http, full, brand }), doneFacets: 0 };

  // Percorre até `maxPages` facetas NOVAS (a partir de onde o checkpoint parou). Cada faceta = 1 fetch.
  const inicio = cursor.doneFacets;
  const fim = Math.min(cursor.facets.length, inicio + Math.max(1, maxPages));
  for (let i = inicio; i < fim; i++) {
    const f = cursor.facets[i];
    const html = await http.fetchText(`${BASE}${f.path}`, { validate: temNext });
    cursor.doneFacets = i + 1;
    if (!html) { writer.save(cursor); continue; }
    const { listings, total } = parseListingPage(html, { collectedAt: writer.collectedAt, brandHint: f.brandHint });
    writer.stats.nbResults[f.label] = total;
    let novos = 0;
    for (const r of listings) if (writer.add(r)) novos++;
    writer.stats.facets++;
    writer.save(cursor);
    console.log(`  [${i + 1}/${cursor.facets.length}] ${f.label} (${total ?? '?'} no total) → +${novos} novos (acum ${writer.stats.records})`);
  }

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, facets: cursor.facets.length, done: cursor.doneFacets };
}
