// encontracarros/crawl.ts — recolha batch do encontracarros.pt: enumera o sitemap, busca cada
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

import { parseDetail, recordId } from './parse.ts';
import { fetchSitemap, districtSlugFromUrl } from './sitemap.ts';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { EncontracarrosRecord } from './schema.ts';

export const PAGE_SIZE = 30;         // anúncios (páginas de detalhe) por "página" lógica
const CAP_ANUNCIOS = 60000;          // salvaguarda (o sitemap tem ~50k)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  fetched: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byFuel: Record<string, number>;
  byNational: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  total: number | null;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  district?: string | null;
  since?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

// A página de detalhe é válida se trouxer o JSON-LD Vehicle ou o objeto carListing.
const detalheValido = (t: string) => t.includes('"@type":"Vehicle"') || t.includes('"carListing"');

function statsVazias(): Stats {
  return { records: 0, pages: 0, fetched: 0, byCountry: {}, bySource: {}, byRegion: {}, byFuel: {},
    byNational: {}, price: { count: 0, sum: 0, min: null, max: null }, total: null };
}
function atualizaStats(stats: Stats, r: EncontracarrosRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byNational[r.national || '?'] = (stats.byNational[r.national || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, district?, since?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, district = null, since = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<EncontracarrosRecord, Stats>({
    outDir, source: 'encontracarros', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
    resumeLog: ({ stats, seenCount }) => `↻ resume: ${stats.records} registos já recolhidos (${seenCount} ids vistos)`,
  });
  const stats = writer.stats;

  let cursor = (writer.cursor as number | null) ?? 0;

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
  for (let i = cursor; i < limite; i++) {
    const e = entries[i];
    if (!e) break;
    cursor = i + 1;
    if (writer.has(e.id)) { if (i % 50 === 0) writer.save(cursor); continue; }   // dedupe global por id

    const html = await http.fetchText(e.url, { validate: detalheValido });
    stats.fetched++;
    if (!html) continue;
    const r = parseDetail(html, { collectedAt: writer.collectedAt, sitemap: e });
    if (!r) continue;
    if (!writer.add(r)) continue;   // dedupe global por id (recordId nulo ou já visto)

    // 1 "página" a cada PAGE_SIZE anúncios buscados → log + checkpoint.
    if (stats.fetched % PAGE_SIZE === 0) {
      stats.pages++;
      writer.save(cursor);
      console.log(`  p${stats.pages} (${i + 1}/${limite}): ${stats.records} registos · último ${r.source} · ${r.make} ${r.model} €${r.price}`);
    }
  }
  writer.save(cursor);

  return { ndjsonPath: writer.ndjsonPath, stats };
}
