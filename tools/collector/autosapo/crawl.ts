// autosapo/crawl.ts — recolha batch do auto.sapo.pt: paginação, dedupe, checkpoint, NDJSON.
// Mesma FORMA dos outros coletores (dedupe global por id, checkpoint/resume, stats), com a unidade
// de recolha = uma PÁGINA HTML da listagem (20 cartões).
//
// COBERTURA (--full): a listagem `/carros-usados?p=N` PAGINA ATÉ AO FIM sem teto — verificado:
// p=1218 (última) devolve os 15 cartões finais (1217×20 + 15 = 24.355 = `total`). Logo iterar
// p=1..totalPages cobre TODO o catálogo em ~1218 pedidos (~30 min ao ritmo educado do lib), sem
// facetas nem lacunas (o dedupe global apanha os "Em destaque" repetidos da 1ª página). Mais simples
// que o Flexicar/aramisauto: a própria paginação chega ao fim.
//   • default : pagina até `maxPages` páginas (amostra).
//   • --full  : pagina até esgotar (nº de páginas lido da própria listagem).
//   • --slice <filtro> : uma query filtrada (ex. "marca=volvo", "localizacao=lisboa").
//   • --detail : enriquece cada anúncio novo com a página de detalhe (caixa/cor/distrito/vendedor/
//     nacional/…). 1 pedido extra por anúncio → só para amostras/fatias, NÃO para o catálogo inteiro.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import {
  LISTING_PATH, BRANDS_SITEMAP, parseListingPage, readPages, recordId, temCartoes,
  extractBrandSlugs, parseDetail, enrich,
} from './parse.ts';
import type { HttpClient } from './http.ts';
import type { AutosapoRecord } from './schema.ts';

const CAP_PAGINAS = 2000;   // salvaguarda dura (a paginação esgota bem antes, ao chegar ao total)

interface Stats {
  records: number;
  pages: number;
  highlighted: number;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  byRegion: Record<string, number>;
  bySeller: Record<string, number>;
  price: { count: number; sum: number; min: number | null; max: number | null };
  total: number | null;
  latestPublished: string | null;
}

interface Checkpoint {
  startedAt: string;
  ndjson: string;
  slice: string | null;
  detail: boolean;
  donePages: number;
  totalPages: number | null;
  seen: string[];
  stats: Stats;
}

interface CrawlConfig {
  http: HttpClient;
  full?: boolean;
  slice?: string | null;
  maxPages?: number;
  outDir: string;
  resume?: boolean;
  detail?: boolean;
}

// URL de listagem. `slice` = filtro cru (ex. "marca=volvo"); `order` = valor de `orderby` (opcional).
function urlListagem(page: number, { slice = null, order = null }: { slice?: string | null; order?: string | null } = {}) {
  const qs = [`p=${page}`];
  if (order) qs.push(`orderby=${order}`);
  if (slice) qs.push(slice);
  return `${BASE}${LISTING_PATH}?${qs.join('&')}`;
}

function statsVazias(): Stats {
  return {
    records: 0, pages: 0, highlighted: 0, byCountry: {}, bySource: {}, byMake: {}, byFuel: {},
    byRegion: {}, bySeller: {}, price: { count: 0, sum: 0, min: null, max: null },
    total: null, latestPublished: null,
  };
}
function atualizaStats(stats: Stats, r: AutosapoRecord) {
  stats.records++;
  if (r.highlighted) stats.highlighted++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byMake[r.make || '?'] = (stats.byMake[r.make || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.bySeller[r.seller_type || '?'] = (stats.bySeller[r.seller_type || '?'] || 0) + 1;
  const pub = r.published_at;
  if (pub && (stats.latestPublished === null || pub > stats.latestPublished)) stats.latestPublished = pub;
  if (r.price != null && r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, slice?, maxPages, outDir, resume?, detail? }
export async function crawl(config: CrawlConfig) {
  const { http, full = false, slice = null, maxPages = 5, outDir, resume = false, detail = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autosapo-checkpoint.json');

  // Taxonomia de marcas (1 pedido) — necessária para separar marca/modelo do h3.
  const brandXml = await http.fetchText(BASE + BRANDS_SITEMAP);
  const brandSet = extractBrandSlugs(brandXml || '');
  console.log(`marcas conhecidas: ${brandSet.size}${brandSet.size ? '' : ' (fallback: 1º token = marca)'}`);

  let ckpt: Checkpoint;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos (página ${ckpt.donePages})`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autosapo-${stamp}.ndjson`), slice, detail, donePages: 0, totalPages: null, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // Pagina a partir de onde o checkpoint parou. `p` é 1-indexado (p=1 = "Pág. 1").
  for (let page = ckpt.donePages + 1; page <= CAP_PAGINAS; page++) {
    if (!full && page > maxPages) break;
    if (ckpt.totalPages !== null && page > ckpt.totalPages) break;   // esgotou a listagem
    const url = urlListagem(page, { slice: ckpt.slice });
    const html = await http.fetchText(url, { validate: temCartoes });
    if (!html) break;                                                // falha/vazio → para (retoma c/ --resume)
    const { listings, total } = parseListingPage(html, { brandSet, collectedAt });
    if (page === 1 || ckpt.totalPages === null) { stats.total = total; ckpt.totalPages = readPages(html); }
    if (!listings.length) break;                                     // fim dos resultados
    let novos = 0;
    for (const r of listings) {
      const id = recordId(r);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (ckpt.detail && r.detail_url) {                             // enriquecimento opcional
        const dhtml = await http.fetchText(r.detail_url);
        if (dhtml) enrich(r, parseDetail(dhtml));
      }
      appendFileSync(ckpt.ndjson, JSON.stringify(r) + '\n');
      atualizaStats(stats, r);
      novos++;
    }
    stats.pages++;
    ckpt.donePages = page;
    saveCkpt();
    console.log(`  pág ${page}/${ckpt.totalPages ?? '?'}: +${novos} novos (acum ${stats.records}/${stats.total ?? '?'})`);
  }

  return { ndjsonPath: ckpt.ndjson, stats };
}
