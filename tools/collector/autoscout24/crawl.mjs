// autoscout24/crawl.mjs — recolha batch do AutoScout24: faceting adaptativo (país × marca ×
// faixa-de-preço), size=100, dedupe global, checkpoint/resume, NDJSON, stats. Mesma forma do
// autotrader/crawl.mjs, escalada para a dimensão pan-europeia (~2,15M sob o cap).
//
// CAP: cada query satura em ~4.000 registos (com size=100 → 40 páginas; o teto é de REGISTOS,
// não de páginas — size só troca throughput). Logo o faceting tem de manter cada faceta ≤4.000.
//
// COBERTURA (--full): cartesiano ADAPTATIVO. Para cada (país, marca) lê numberOfResults; se
// ≤cap pagina direto; se >cap sub-fatia por FAIXA DE PREÇO (pricefrom/priceto). Seed de marcas
// vem da `taxonomy.makesSorted` do próprio __NEXT_DATA__ (sem hardcode). Dedupe global por `id`
// (o mesmo anúncio surge em facetas sobrepostas). Faixas densas podem ainda saturar — degradação
// aceitável e documentada (research/autoscout24-investigacao.md).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, recordId, extractMakes } from './parse.mjs';
import { enrichWithDetail } from './detail.mjs';

const BASE = 'https://www.autoscout24.de';
const CAP_RECORDS = 4000;          // teto de registos por query (empírico: 40 pág × size 100)
const PAN_EU = ['D', 'A', 'B', 'E', 'F', 'I', 'L', 'NL'];   // Alemanha, Áustria, Bélgica, Espanha, França, Itália, Luxemburgo, Holanda

// Faixas de preço (€) para o modo --full. Mais finas na zona densa (baixo-médio).
const FAIXAS_PRECO = [
  [0, 1500], [1500, 2500], [2500, 3500], [3500, 4500], [4500, 5500], [5500, 6500],
  [6500, 7500], [7500, 8500], [8500, 9500], [9500, 11000], [11000, 12500], [12500, 14000],
  [14000, 16000], [16000, 18500], [18500, 21000], [21000, 25000], [25000, 30000],
  [30000, 40000], [40000, 60000], [60000, 100000], [100000, 0],
];

const validate = (t) => t.includes('__NEXT_DATA__');

// Constrói o URL de listagem. Prefere o path /lst/<slug> (mais limpo e fora do `/lst?` que o
// robots proíbe); recorre a mmvmk0=<id> quando só há id.
function buildUrl({ slug, makeId, cy, pricefrom, priceto, size, page }) {
  const path = slug ? `/lst/${slug}` : '/lst';
  const qs = new URLSearchParams({ size: String(size) });
  if (cy) qs.set('cy', cy);
  if (makeId && !slug) qs.set('mmvmk0', String(makeId));
  if (pricefrom) qs.set('pricefrom', String(pricefrom));
  if (priceto) qs.set('priceto', String(priceto));
  if (page && page > 1) qs.set('page', String(page));
  return `${BASE}${path}?${qs}`;
}

function statsVazias() {
  return {
    records: 0, pages: 0, byCountry: {}, bySource: {}, byPriceEval: {},
    price: { count: 0, sum: 0, min: null, max: null },
  };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  const pe = r.price_evaluation == null ? '?' : String(r.price_evaluation);
  stats.byPriceEval[pe] = (stats.byPriceEval[pe] || 0) + 1;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

// config: { http, full?, countries?[], makes?[]|null, maxPages, size, outDir, resume?, detail? }
//   countries: lista de cy (ex. ['D','F']); [null] = sem filtro de país.
//   makes: lista de { id, label, slug } explícita; null = (full) semear da taxonomy, (amostra) sem filtro.
export async function crawl(config) {
  const {
    http, full = false, countries = [null], makes = null,
    maxPages = 5, size = 100, outDir, resume = false, detail = false,
  } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'autoscout24-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `autoscout24-${stamp}.ndjson`), doneQueries: {}, nbResults: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const capPages = Math.ceil(CAP_RECORDS / size);
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  const ctx = { http, size, maxPages, capPages, detail, collectedAt, seen, stats, ckpt, saveCkpt };

  // --- resolver a lista de marcas ---
  let makeRefs = makes;
  if (full && (!makeRefs || !makeRefs.length)) {
    // seed sem hardcode: sondar a taxonomy do próprio site.
    const seedUrl = buildUrl({ cy: countries.find(Boolean) || null, size, page: 1 });
    const html = await http.fetchText(seedUrl, { validate });
    const tax = html ? parseListingPage(html).taxonomy : null;
    makeRefs = extractMakes(tax);
    console.log(`  seed: ${makeRefs.length} marcas da taxonomy`);
  }
  if (!makeRefs || !makeRefs.length) makeRefs = [null];   // sem filtro de marca

  // --- plano de facetas: país × marca (fatiado por preço quando satura, só em --full) ---
  const cyList = countries.length ? countries : [null];
  for (const cy of cyList) {
    for (const mk of makeRefs) {
      const cyLabel = cy || 'ALL';
      const mkLabel = mk ? mk.label : 'all';
      const labelBase = `${cyLabel}|${mkLabel}`;
      const params = { cy, slug: mk?.slug || null, makeId: mk?.id || null };

      // Sonda a 1ª página (ingere-a) para conhecer numberOfResults antes de decidir fatiar.
      let nb = ckpt.nbResults[labelBase];
      if (nb == null) {
        await paginate(ctx, labelBase, params, 1);      // ingere só a página 1
        nb = ckpt.nbResults[labelBase] ?? null;
      }

      if (full && nb != null && nb > CAP_RECORDS) {
        // Satura → sub-fatiar por faixa de preço.
        console.log(`  ${labelBase}: ${nb} > ${CAP_RECORDS} → fatiar por preço`);
        for (const [from, to] of FAIXAS_PRECO) {
          const sliceLabel = `${labelBase}|€${from}-${to || '+'}`;
          await paginate(ctx, sliceLabel, { ...params, pricefrom: from, priceto: to }, maxPages);
        }
      } else {
        // Não satura (ou modo amostra) → paginar direto (a partir da pág. 2; a 1 já foi ingerida).
        await paginate(ctx, labelBase, params, maxPages);
      }
    }
  }

  return { ndjsonPath: ckpt.ndjson, stats, facets: Object.keys(ckpt.doneQueries).length };
}

// Pagina uma query (label único) da página seguinte-à-checkpoint até min(endPage, capPages).
// Ingere anúncios novos (dedupe global), atualiza stats/checkpoint. Regista numberOfResults na
// 1ª leitura. Enriquece com --detail (1 req/anúncio) se ativo.
async function paginate(ctx, label, params, endPage) {
  const { http, size, capPages, detail, collectedAt, seen, stats, ckpt, saveCkpt } = ctx;
  const start = (ckpt.doneQueries[label] || 0) + 1;
  const end = Math.min(endPage ?? ctx.maxPages, capPages);
  for (let page = start; page <= end; page++) {
    const url = buildUrl({ ...params, size, page });
    const html = await http.fetchText(url, { validate });
    if (!html) break;
    const { listings, numberOfResults, numberOfPages } = parseListingPage(html, { collectedAt });
    if (ckpt.nbResults[label] == null) ckpt.nbResults[label] = numberOfResults;
    if (!listings.length) break;                          // fim dos resultados
    let novos = 0;
    for (const r of listings) {
      const id = recordId(r);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      let rec = r;
      if (detail && r.detail_url) rec = await enrichWithDetail(http, r, collectedAt);
      appendFileSync(ckpt.ndjson, JSON.stringify(rec) + '\n');
      atualizaStats(stats, rec);
      novos++;
    }
    stats.pages++;
    ckpt.doneQueries[label] = page;
    saveCkpt();
    console.log(`  ${label} p${page}: +${novos} novos (total ${stats.records})`);
    if (numberOfPages && page >= numberOfPages) break;    // não há mais páginas nesta query
  }
}

export { PAN_EU };
