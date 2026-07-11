// aramisauto/parse.mjs — extração dos dados de uma página de listagem do aramisauto.com.
//
// PADRÃO-MOLDE: autotrader/autoboerse (JSON SSR embutido), NÃO o JSON-LD+card do theparking/
// autocasion. A diferença vs. autotrader/autoboerse (que fazem `JSON.parse` de `__NEXT_DATA__`) é
// que o aramisauto é uma app **Nuxt**: o estado vem num `window.__NUXT__=(function(a,b,…){return
// {…}}(…))` — uma IIFE minificada, não JSON puro. Avaliamo-la num **sandbox `node:vm`** com
// contexto VAZIO e timeout (não `eval` global) — a payload do Nuxt é dados puros, mas o sandbox
// evita qualquer efeito colateral se o site mudar o minificador.
//
// FONTE ÚNICA E RICA: `nuxt.data[0].displayedSearchVehicleResponse.vehicles` = array de 24 veículos
// com TODOS os campos (maker, model, finish, engine, energyType, transmission, mileage,
// firstCirculationDate, power, category, simpleColors, price, photo, offerType…). O JSON-LD da
// página só traz name/url/price (pobre) → ignoramo-lo; o `__NUXT__` chega para tudo, incluindo o
// `detail_url` (reconstruído das partes: makerId/modelId/finishId/offerId/vehicleId — bate 1:1 com
// os URLs do JSON-LD, já verificado).

import vm from 'node:vm';
import { normalizeVehicle } from './schema.mjs';

// Validador para o fetchText do lib: a página é útil só se trouxer o estado Nuxt.
export const temNuxt = (t) => t.includes('window.__NUXT__');

// (1) Extrai e avalia o objeto `window.__NUXT__`. Isola a IIFE (de `window.__NUXT__=` até ao
// `</script>` seguinte), tira o `;` final e avalia num contexto vazio e limitado no tempo.
// Devolve o objeto de estado ou null se não existir/falhar.
export function parseNuxt(html) {
  const marca = 'window.__NUXT__=';
  const i = html.indexOf(marca);
  if (i < 0) return null;
  const fim = html.indexOf('</script>', i);
  if (fim < 0) return null;
  const code = html.slice(i + marca.length, fim).replace(/;\s*$/, '');
  try {
    return vm.runInNewContext('(' + code + ')', Object.create(null), { timeout: 5000 });
  } catch {
    return null; // minificação inesperada / payload malformada
  }
}

// Atalho para a resposta de pesquisa dentro do estado Nuxt (defensivo em cada nível).
function searchResponse(nuxt) {
  return nuxt?.data?.[0]?.displayedSearchVehicleResponse || null;
}

// (2) Parse completo de uma página → { listings, total }.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const nuxt = parseNuxt(html);
  const resp = searchResponse(nuxt);
  if (!resp || !Array.isArray(resp.vehicles)) return { listings: [], total: null };
  const listings = resp.vehicles.map((v) => normalizeVehicle(v, { collectedAt }));
  return { listings, total: typeof resp.total === 'number' ? resp.total : null };
}

// Total de anúncios da query (campo `total` da resposta Nuxt). Devolve null se não encontrar.
export function readTotal(html) {
  const resp = searchResponse(parseNuxt(html));
  return resp && typeof resp.total === 'number' ? resp.total : null;
}

// Categorias (carroçarias) para o modo --full. São silos SEO `/achat/{categoria}/` PERMITIDOS pelo
// robots, e PARTICIONAM o catálogo: as contagens do facet `categoryId` somam exatamente o `total`
// (~2.871), logo iterá-las cobre tudo sem sobreposição (o dedupe global apanha qualquer resíduo).
// Taxonomia SEO estável — hardcoded de propósito (mais determinístico que raspar links da página).
export const CATEGORIAS = [
  '4x4-et-suv', 'berline-compacte', 'break', 'cabriolet', 'citadine',
  'coupe', 'ludospace', 'monospace', 'routiere', 'utilitaire',
];

// Chave de dedupe / sinal de recência: o `vehicleId` (id numérico crescente = entrada mais recente
// no catálogo). Serve de proxy de recência no watch (o site não expõe sort por data — e o robots
// proíbe `/*sort=*` / `/*orderBy`).
export function recordId(rec) {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
