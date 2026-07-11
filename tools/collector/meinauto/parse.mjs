// meinauto/parse.mjs — extração dos dados de uma página de resultados do meinauto.de.
//
// PADRÃO-MOLDE: aramisauto (JSON SSR embutido de uma app Nuxt), MAS com uma diferença importante:
// o meinauto é **Nuxt 3**, cujo payload SSR vem num `<script id="__NUXT_DATA__" type="application/
// json">` em **JSON puro** — logo `JSON.parse` chega, NÃO precisamos do `node:vm` do aramisauto
// (que era Nuxt 2, com IIFE `window.__NUXT__=(function…)`).
//
// GOTCHA (formato devalue): o Nuxt 3 serializa o estado em **devalue "flatten"** — um ARRAY plano
// onde cada nó referencia outros por ÍNDICE inteiro (dedup + suporte a ciclos/refs do Vue). Não é
// uma árvore JSON normal: `{"mileage":7751}` significa "mileage = valor no índice 7751". Por isso
// re-hidratamos o grafo (`unflatten`) antes de o usar. É determinístico e sem efeitos colaterais
// (ao contrário de avaliar JS), por isso preferimo-lo ao vm.
//
// FONTE = `root.pinia.results` = { meta, results }. `results[]` = 47 veículos/página com TODOS os
// campos (make/model/trim/initialRegistration/mileage/metaFuelType/transmission/ccm/color/doors/
// bodyType/purchasePrice/seller/addresses/images/createdAt/power/co2/previousOwner…). `meta` traz
// `totalResults` e `counts` (facetas — marcas, combustíveis, etc.), que semeiam o modo --full.

import { normalizeVehicle } from './schema.mjs';

// Validador para o fetchText do lib: a página só é útil se trouxer o payload SSR do Nuxt 3.
export const temNuxtData = (t) => t.includes('__NUXT_DATA__');

// Tags de tipo do devalue que podem aparecer no payload do Nuxt (Refs/Reactive do Vue + tipos JS).
const TAGS = new Set(['Date', 'Set', 'Map', 'RegExp', 'Object', 'BigInt', 'null',
  'Ref', 'Reactive', 'ShallowReactive', 'ShallowRef']);

// (1) Re-hidrata o array "flatten" do devalue num objeto normal.
// Regras do formato: o nó 0 é a raiz; dentro de containers, os valores são ÍNDICES (referências);
// um slot com primitivo (string/número/bool/null) é literal; um array cujo 1º elemento é uma string
// conhecida é um valor tipado (Ref/Set/Map/Date…); índices negativos são sentinelas (-1 undefined,
// -3 NaN, -4/-5 ±Infinity, -6 -0). Memoizamos por índice (nós partilhados) e pré-registamos os
// containers antes de recursar, para que ciclos (reatividade do Vue) resolvam para o objeto parcial.
export function unflatten(arr) {
  if (!Array.isArray(arr)) return null;
  const N = arr.length;
  const memo = new Array(N);
  const done = new Array(N).fill(false);

  function hydrate(i, stack) {
    if (typeof i !== 'number') return i;
    if (i < 0) {
      if (i === -3) return NaN;
      if (i === -4) return Infinity;
      if (i === -5) return -Infinity;
      if (i === -6) return -0;
      return null;                                   // -1 undefined, -2 hole → null
    }
    if (i >= N) return null;
    if (done[i]) return memo[i];
    if (stack.has(i)) return memo[i];                // ciclo → objeto parcial já registado

    const v = arr[i];
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
      memo[i] = v; done[i] = true; return v;
    }

    stack.add(i);
    let res;
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'string' && TAGS.has(v[0])) {
        const tag = v[0];
        if (tag === 'Set') { res = v.slice(1).map((x) => hydrate(x, stack)); }
        else if (tag === 'Map') {
          res = {};
          for (let k = 1; k + 1 < v.length; k += 2) res[hydrate(v[k], stack)] = hydrate(v[k + 1], stack);
        } else if (tag === 'Date') { res = v[1]; }
        // Ref/Reactive/ShallowReactive/ShallowRef/Object/null → embrulham um único valor
        else { res = v.length > 1 ? hydrate(v[1], stack) : null; }
        memo[i] = res;
      } else {
        res = []; memo[i] = res;                      // array simples: elementos são referências
        for (const x of v) res.push(hydrate(x, stack));
      }
    } else if (v && typeof v === 'object') {
      res = {}; memo[i] = res;                        // objeto: valores são referências
      for (const k of Object.keys(v)) res[k] = hydrate(v[k], stack);
    } else {
      res = v; memo[i] = res;
    }
    done[i] = true; stack.delete(i);
    return res;
  }

  try { return hydrate(0, new Set()); } catch { return null; }
}

// (2) Extrai e re-hidrata o payload __NUXT_DATA__ da página. Devolve a raiz ou null.
export function extractNuxtData(html) {
  const i = html.indexOf('id="__NUXT_DATA__"');
  if (i < 0) return null;
  const start = html.indexOf('>', i);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) return null;
  let arr;
  try { arr = JSON.parse(html.slice(start + 1, end)); } catch { return null; }
  return unflatten(arr);
}

// Atalho para o contentor de resultados dentro do estado Pinia (defensivo em cada nível).
function resultsContainer(root) {
  return root?.pinia?.results || null;
}

// (3) Parse completo de uma página → { listings, total, makes }.
// `makes` = nomes de marca das facetas (meta.counts.makes) — seed do modo --full; só interessa na
// 1ª página (sonda), mas devolvemo-lo sempre (barato).
export function parseListingPage(html, { collectedAt = null } = {}) {
  const cont = resultsContainer(extractNuxtData(html));
  const list = cont?.results;
  if (!cont || !Array.isArray(list)) return { listings: [], total: null, makes: [] };
  const total = typeof cont.meta?.totalResults === 'number' ? cont.meta.totalResults : null;
  const makes = cont.meta?.counts?.makes && typeof cont.meta.counts.makes === 'object'
    ? Object.keys(cont.meta.counts.makes) : [];
  return { listings: list.map((r) => normalizeVehicle(r, { collectedAt })), total, makes };
}

// Total de anúncios da query (meta.totalResults). Devolve null se não encontrar.
export function readTotal(html) {
  const cont = resultsContainer(extractNuxtData(html));
  return typeof cont?.meta?.totalResults === 'number' ? cont.meta.totalResults : null;
}

// Chave de dedupe / recência: o `id` (hash estável do anúncio, usado também no detail_url).
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
