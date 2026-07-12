// standvirtual/crawl.mjs — recolha batch do standvirtual.com: paginação, dedupe, checkpoint,
// NDJSON, stats. Mesma forma do autoboerse/crawl.mjs.
//
// COBERTURA (--full): AO CONTRÁRIO do que a investigação previa, o StandVirtual NÃO tem cap de
// ~500 páginas — a paginação por `?page=N` chega ao FIM do catálogo (probes: página 1324 =
// offset 42336 devolve o último anúncio de 42.337; página ≥1400 vem vazia). Por isso o modo
// `--full` PAGINA DIRETO a listagem geral `/carros` até esgotar (~1324 páginas de 32), com
// cobertura completa — SEM precisar de fatiar por marca. O fatiamento por marca continua
// disponível via `--brand {slug}` (ex. `bmw`, `mercedes-benz`), útil para corridas dirigidas.
//
// SORT DETERMINÍSTICO: forçamos `search[order]=created_at_first:desc` em todas as páginas. O
// default do site (`relevance_web`) é embaralhado/personalizado → produziria lacunas na
// paginação por offset. Com ordenação por data de criação (desc), anúncios novos inseridos
// durante a corrida só empurram para baixo (geram duplicados, filtrados pelo dedupe) e não
// abrem lacunas. Serve também de sinal de recência.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, recordId } from './parse.mjs';

const ORDER = 'created_at_first:desc';
const CAP_PAGINAS = 1500;   // salvaguarda > 1324 (catálogo completo); na prática esgota antes

// URL de listagem. `brand` (slug, ex. "bmw") fatia via path; page>1 acrescenta ?page=N.
function urlListagem(brand, page) {
  const path = brand ? `/carros/${brand}` : '/carros';
  const qs = new URLSearchParams({ 'search[order]': ORDER });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}${path}?${qs}`;
}

function statsVazias() {
  return { records: 0, pages: 0, byCountry: {}, bySource: {}, byRegion: {}, bySellerType: {}, byFuel: {}, price: { count: 0, sum: 0, min: null, max: null }, nbResults: {} };
}
function atualizaStats(stats, r) {
  stats.records++;
  stats.byCountry[r.country || '?'] = (stats.byCountry[r.country || '?'] || 0) + 1;
  stats.bySource[r.source || '?'] = (stats.bySource[r.source || '?'] || 0) + 1;
  stats.byRegion[r.region || '?'] = (stats.byRegion[r.region || '?'] || 0) + 1;
  stats.bySellerType[r.seller_type || '?'] = (stats.bySellerType[r.seller_type || '?'] || 0) + 1;
  stats.byFuel[r.fuel || '?'] = (stats.byFuel[r.fuel || '?'] || 0) + 1;
  if (r.price > 0) { const p = stats.price; p.count++; p.sum += r.price; p.min = p.min === null ? r.price : Math.min(p.min, r.price); p.max = p.max === null ? r.price : Math.max(p.max, r.price); }
}

const temAdvertSearch = (t) => t.includes('advertSearch');

// config: { http, full?, brand?, maxPages, outDir, resume? }
export async function crawl(config) {
  const { http, full = false, brand = null, maxPages = 5, outDir, resume = false } = config;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, 'standvirtual-checkpoint.json');

  let ckpt;
  if (resume && existsSync(ckptPath)) {
    ckpt = JSON.parse(readFileSync(ckptPath, 'utf8'));
    console.log(`↻ resume: ${ckpt.stats.records} registos já recolhidos`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    ckpt = { startedAt: stamp, ndjson: join(outDir, `standvirtual-${stamp}.ndjson`), doneQueries: {}, seen: [], stats: statsVazias() };
  }
  const seen = new Set(ckpt.seen);
  const stats = ckpt.stats;
  const collectedAt = new Date().toISOString();
  const saveCkpt = () => { ckpt.seen = [...seen]; writeFileSync(ckptPath, JSON.stringify(ckpt)); };

  // --- plano de queries ---
  // Uma única query (listagem geral, ou uma marca via --brand). Sem fan-out por marca porque a
  // paginação direta já cobre o catálogo todo (ver cabeçalho).
  const label = brand || 'carros';
  const queries = [{ label, brand }];

  // Limite efetivo de páginas: --full percorre até esgotar (cap de salvaguarda); senão maxPages.
  const limitePaginas = full ? CAP_PAGINAS : Math.min(maxPages, CAP_PAGINAS);

  for (const q of queries) {
    const startPage = (ckpt.doneQueries[q.label] || 0) + 1;
    for (let page = startPage; page <= limitePaginas; page++) {
      const url = urlListagem(q.brand, page);
      const html = await http.fetchText(url, { validate: temAdvertSearch });
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
