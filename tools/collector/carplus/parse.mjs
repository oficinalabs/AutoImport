// carplus/parse.mjs — extração dos dados de uma página de listagem do carplus.pt (`/carros-usados/`).
//
// PADRÃO-MOLDE: __NEXT_DATA__ (autotrader/autoboerse) — FONTE ÚNICA e RICA embutida no HTML SSR —,
// e NÃO o "JSON-LD + card" do autopt/autocasion. Aqui a fonte é o payload `__NUXT_DATA__` do Nuxt 3
// (o carplus.pt é um SPA Nuxt com SSR completo), que traz um objeto por viatura com ~64 campos:
// vin, brand/model/version, year, km, fuel, transmission, power, displacement(cilindrada), doors,
// seats, color, pricePvp, previousPrice, monthlyPrice, taeg, dealerDistrict/Municipality,
// installationName(stand), stock, origin, condition, availability, updateTime(recência), etc.
//
// ⚠️ FORMATO `__NUXT_DATA__` (devalue): NÃO é JSON normal. É um ARRAY PLANO onde cada nó referencia
// outros por ÍNDICE (as chaves e os valores dos objetos são inteiros que apontam para posições do
// array). É preciso "resolver" recursivamente para reconstruir os objetos. É a razão de termos o
// `resolveNuxt` abaixo, em vez de um `JSON.parse` direto como no autoboerse (Next.js).
//
// COMPLEMENTO (detail_url): o payload da viatura NÃO traz o URL de detalhe pronto; traz o `vin`. O
// mesmo HTML tem 16 blocos JSON-LD `Vehicle` cujo `offers.url` termina no VIN em minúsculas
// (`/veiculo/{marca}-{modelo}-{versao}-{vin}/`). Construímos um mapa vin→url a partir do JSON-LD e
// juntamo-lo à viatura pelo VIN (robusto contra acentos no slug, ex. Citroën→citroen). Sem par,
// reconstruímos o URL a partir dos campos (fallback best-effort).

import { normalizeVehicle } from './schema.mjs';
import { BASE } from './http.mjs';

// (1) Resolver do payload devalue do Nuxt: reconstrói objetos a partir do array plano por índices.
// Memoiza por índice (também protege contra ciclos: a entrada é registada na cache antes de descer).
function resolveNuxt(html) {
  const s = html.indexOf('id="__NUXT_DATA__"');
  if (s < 0) return null;
  const gt = html.indexOf('>', s);
  const end = html.indexOf('</script>', gt);
  if (gt < 0 || end < 0) return null;
  let arr;
  // GOTCHA (como no theparking/autocasion): sanitizamos caracteres de controlo (0x00–0x1f) dentro
  // das strings, que de outro modo tornariam o JSON do array inválido, antes do JSON.parse.
  try { arr = JSON.parse(html.slice(gt + 1, end).replace(/[\x00-\x1f]+/g, ' ')); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const cache = new Map();
  const resolve = (i, depth = 0) => {
    if (typeof i !== 'number' || i < 0 || i >= arr.length || depth > 40) return null;
    if (cache.has(i)) return cache.get(i);
    const n = arr[i];
    if (n === null || typeof n !== 'object') { cache.set(i, n); return n; }
    if (Array.isArray(n)) {
      const out = []; cache.set(i, out);
      for (const e of n) out.push(typeof e === 'number' ? resolve(e, depth + 1) : e);
      return out;
    }
    const out = {}; cache.set(i, out);
    for (const k of Object.keys(n)) {
      const key = arr[Number(k)];                       // a chave do objeto é um índice → string
      out[typeof key === 'string' ? key : k] = typeof n[k] === 'number' ? resolve(n[k], depth + 1) : n[k];
    }
    return out;
  };
  return { arr, resolve };
}

// Extrai o array de viaturas (objetos com `vin` + `brand`) do payload `__NUXT_DATA__`.
// Um nó-viatura é um objeto que, uma vez resolvido, tem `vin` (string) e `brand`. Dedupe por VIN.
export function extractNuxtVehicles(html) {
  const ctx = resolveNuxt(html);
  if (!ctx) return [];
  const { arr, resolve } = ctx;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
    const o = resolve(i);
    if (o && typeof o === 'object' && typeof o.vin === 'string' && o.vin && o.brand && !seen.has(o.vin)) {
      seen.add(o.vin);
      out.push(o);
    }
  }
  return out;
}

// (2) Mapa vin(minúsculas)→detail_url a partir dos blocos JSON-LD `Vehicle` (offers.url acaba no VIN).
export function extractUrlByVin(html) {
  const map = new Map();
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let j;
    try { j = JSON.parse(m[1].replace(/[\x00-\x1f]+/g, ' ')); } catch { continue; }
    const url = j && j['@type'] === 'Vehicle' ? j.offers?.url : null;
    if (!url) continue;
    const vin = (/\/veiculo\/[a-z0-9-]*?-([a-z0-9]{8,20})\/?$/i.exec(url) || [])[1];
    if (vin) map.set(vin.toLowerCase(), url);
  }
  return map;
}

// (3) Parse completo de uma página → { listings, total }. Cada viatura (payload) é enriquecida com o
// detail_url do JSON-LD (por VIN) e normalizada para o registo comum.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const vehicles = extractNuxtVehicles(html);
  const urlByVin = extractUrlByVin(html);
  const listings = vehicles.map((v) =>
    normalizeVehicle(v, { detailUrl: urlByVin.get(String(v.vin).toLowerCase()) || null, collectedAt }));
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query: o `offerCount` do bloco JSON-LD `Product`/`AggregateOffer` (ex. 1037 na
// listagem geral, 26 numa marca). Fallback: o contador textual "RESULTADOS: N" do HTML. null se nada.
export function readTotal(html) {
  const m = /"offerCount":\s*(\d+)/.exec(html);
  if (m) return Number(m[1]);
  const t = /RESULTADOS:\s*([\d.]+)/i.exec(html);
  return t ? Number(t[1].replace(/\./g, '')) : null;
}

// Chave de dedupe / join / sinal de recência: o VIN (identificador físico único da viatura).
export function recordId(rec) {
  return rec.id || rec.vin || rec.detail_url || null;
}
