// flexicar/crawl.ts — recolha batch do flexicar.es: fatiamento por faceta, dedupe, checkpoint, NDJSON.
// Mesma forma do autoboerse/autocasion (dedupe global por id, checkpoint/resume, stats), MAS adaptada
// ao facto de o SSR do Flexicar NÃO paginar.
//
// ⚠️ COBERTURA: o SSR devolve sempre 12 veículos por URL (o `?page=N` é ignorado; a paginação real é por
// XHR a services.flexicar.es, host com robots `Disallow: /` → não usamos). Por isso a unidade de recolha
// é a FACETA (não a página): cada URL `…/segunda-mano/` render 12. `--max-pages N` limita o nº de facetas
// processadas (nome mantido por paridade com os outros CLIs).
//   • default : query base `/coches-segunda-mano/` + fatias por marca (seed de `pageProps.brands`).
//   • --brand : só `/{marca}/segunda-mano/`.
//   • --full  : ~9.685 facetas do sitemap.xml (marca·modelo·província…); as granulares têm ≤12 →
//               captura total da fatia. A união deduplicada cobre uma fração grande dos ~22,5k anúncios.

import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, extractSitemapFacets, recordId } from './parse.ts';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { FlexicarRecord } from './schema.ts';

const temNext = (t: string) => t.includes('__NEXT_DATA__');
const brandPath = (slug: string) => `/${slug}/segunda-mano/`;
const BASE_PATH = '/coches-segunda-mano/';

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  facets: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
  maxId: number | null;
}

// Cursor persistido (checkpoint) para retomar (--resume): as facetas planeadas + quantas já feitas.
interface FacetCursor {
  facets: string[];
  doneFacets: number;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

function statsVazias(): Stats {
  return { records: 0, facets: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, maxId: null };
}
function atualizaStats(stats: Stats, r: FlexicarRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.id != null) stats.maxId = stats.maxId === null ? r.id : Math.max(stats.maxId, r.id);
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// Constrói a lista de facetas (paths relativos) a percorrer, conforme o modo.
async function planearFacetas({ http, full, brand }: { http: HttpClient; full: boolean; brand: string | null }): Promise<string[]> {
  if (brand) return [brandPath(String(brand).toLowerCase())];
  if (full) {
    const xml = await http.fetchText(`${BASE}/sitemap.xml`);
    const facets = xml ? extractSitemapFacets(xml) : [];
    console.log(`--full: ${facets.length} facetas do sitemap a percorrer (12 SSR cada; granulares captam a fatia toda)`);
    return facets;
  }
  // default: base + fatias por marca (descobre os slugs na 1ª página)
  const probe = await http.fetchText(`${BASE}${BASE_PATH}`, { validate: temNext });
  const brands = probe ? extractBrandSlugs(probe) : [];
  return [BASE_PATH, ...brands.map(brandPath)];
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<FlexicarRecord, Stats>({
    outDir, source: 'flexicar', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
    resumeLog: ({ stats, cursor }) => {
      const c = cursor as FacetCursor;
      return `↻ resume: ${stats.records} registos já recolhidos (${c.doneFacets}/${c.facets.length} facetas feitas)`;
    },
  });
  const stats = writer.stats;

  // Cursor: no arranque fresco planeamos as facetas; no resume vêm do checkpoint (não re-planeamos).
  let cursor = writer.cursor as FacetCursor | null;
  if (!cursor) cursor = { facets: await planearFacetas({ http, full, brand }), doneFacets: 0 };

  // Percorre até `maxPages` facetas NOVAS (a partir de onde o checkpoint parou). Cada faceta = 1 fetch.
  const inicio = cursor.doneFacets;
  const fim = Math.min(cursor.facets.length, inicio + Math.max(1, maxPages));
  for (let i = inicio; i < fim; i++) {
    const path = cursor.facets[i];
    const html = await http.fetchText(`${BASE}${path}`, { validate: temNext });
    cursor.doneFacets = i + 1;
    if (!html) { writer.save(cursor); continue; }
    const { listings, total } = parseListingPage(html, { collectedAt: writer.collectedAt });
    if (i === 0) stats.nbResults[path] = total;
    let novos = 0;
    for (const r of listings) if (writer.add(r)) novos++;
    stats.facets++;
    writer.save(cursor);
    console.log(`  [${i + 1}/${cursor.facets.length}] ${path} (${total ?? '?'} no total) → +${novos} novos (acum ${stats.records})`);
  }

  return { ndjsonPath: writer.ndjsonPath, stats, facets: cursor.facets.length, done: cursor.doneFacets };
}
