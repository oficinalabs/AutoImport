// ocasionplus/crawl.ts — recolha batch do ocasionplus.com: paginação, dedupe, checkpoint, NDJSON.
// Mesma forma do autocasion/crawl.ts (dedupe global por id, checkpoint/resume, stats).
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
//
// IVA (P05, estudo ES §3.2): o card e o JSON-LD não trazem etiqueta de IVA; o único sinal é a
// landing-page de PATH `/coches-ocasion/iva-deducible` (~4.400 carros "Factura con IVA desglosado").
// Sem --brand, percorremos essa página PRIMEIRO e marcamos os carros como 'dedutivel'; como o dedupe
// é global por id, as fatias seguintes já não os reescrevem sem marca. Os restantes ficam null (o
// motor trata null como margem). O sink grava com coalesce, por isso o watch (sem marca) não apaga.

import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.ts';
import { createCrawlWriter, runPagedCrawl } from '../lib/crawl.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OcasionplusRecord } from './schema.ts';
import type { VatRegimeAnuncio } from '../lib/normalize.ts';

const CAP_PAGINAS = 800;   // salvaguarda; na prática a listagem esgota antes (páginas vazias)

// Estatísticas acumuladas ao longo do crawl.
interface Stats {
  records: number;
  pages: number;
  byCountry: Record<string, number>;
  byRegion: Record<string, number>;
  byCenter: Record<string, number>;
  byFuel: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  nbResults: Record<string, number | null>;
  byVatRegime?: Record<string, number>;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  brand?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
}

interface Query { label: string; path: string; vatRegime?: VatRegimeAnuncio }

// Fatia de path de uma marca (slug, ex. "audi") ou a listagem geral.
const queryMarca = (brand: string | null): Query =>
  ({ label: brand || 'coches-segunda-mano', path: brand ? `/coches-segunda-mano/${brand}` : '/coches-segunda-mano' });

// Landing-page "IVA Deducible" (path, permitida pelo robots): tudo o que lista é 'dedutivel'.
export const QUERY_IVA_DEDUCIBLE: Query = { label: 'iva-deducible', path: '/coches-ocasion/iva-deducible', vatRegime: 'dedutivel' };

// URL de listagem; page>1 acrescenta ?page=N.
function urlListagem(path: string, page: number) {
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

const temVehicle = (t: string) => t.includes('"@type":"Vehicle"');

function statsVazias(): Stats {
  return { records: 0, pages: 0, byCountry: {}, byRegion: {}, byCenter: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {}, byVatRegime: {} };
}
function atualizaStats(stats: Stats, r: OcasionplusRecord) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.byCenter[r.center || '?'] = (stats.byCenter[r.center || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  const vat = (stats.byVatRegime ??= {});   // ??=: checkpoints anteriores ao P05 não têm o bucket
  vat[r.vat_regime || '?'] = (vat[r.vat_regime || '?'] || 0) + 1;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  const writer = createCrawlWriter<OcasionplusRecord, Stats>({
    outDir, source: 'ocasionplus', resume, recordId, newStats: statsVazias, updateStats: atualizaStats,
  });

  // --- plano de queries ---
  // --full: uma query por marca (descobre os slugs em /marcas). Sem --full: uma só query (com marca
  // opcional via --brand). Sem --brand, a página "IVA deducible" vai à frente (ver nota no topo).
  let queries: Query[];
  if (full) {
    const probe = await http.fetchText(`${BASE}/marcas`);
    const slugs = probe ? extractBrandSlugs(probe) : [];
    queries = [QUERY_IVA_DEDUCIBLE, ...slugs.map(queryMarca)];
    console.log(`--full: iva-deducible + ${slugs.length} marcas a percorrer (ex.: ${queries.slice(1, 6).map((q) => q.label).join(', ')}…)`);
  } else {
    queries = brand ? [queryMarca(brand)] : [QUERY_IVA_DEDUCIBLE, queryMarca(null)];
  }

  const cursor = (writer.cursor as Record<string, number>) ?? {};
  await runPagedCrawl({
    writer, queries, cursor, maxPages, cap: CAP_PAGINAS,
    fetchPage: async (q, page, collectedAt) => {
      const html = await http.fetchText(urlListagem(q.path, page), { validate: temVehicle });
      if (!html) return null;
      const { listings, total } = parseListingPage(html, { collectedAt, vatRegime: q.vatRegime ?? null });
      if (page === 1) writer.stats.nbResults[q.label] = total;
      return { listings };
    },
    stop: ({ novos, page, startPage }) => !novos && page > startPage,   // página sem novos → provável fim/repetição
  });

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, queries: queries.length };
}
