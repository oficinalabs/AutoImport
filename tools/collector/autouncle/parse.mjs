// autouncle/parse.mjs — extração dos dados de uma página de listagem SSR do autouncle.pt.
//
// MOLDE AGREGADOR (como o theparking): a página traz os carros em DOIS sítios que juntamos pelo carId:
//   (1) JSON-LD  — 1 bloco `application/ld+json` com `@graph` → `ItemList.itemListElement[25].item`
//       (um `Product`+`Vehicle` rico) + `ItemList.numberOfItems` = total da query. É a fonte "de
//       catálogo" (make/model/ano/km/combustível/caixa/cilindrada/cor/portas/carroçaria/preço/URL).
//   (2) RSC      — o payload React Server Components em ~250 `self.__next_f.push([n,"…"])`. Concatenado,
//       tem por carro um objeto de props com a FONTE de origem (`sourceName`), o AutoScore (`auRating`),
//       a imagem real (`imageUrls`), a variante (`equipmentVariant`) e os dias em stock (`laytime`) —
//       tudo o que um AGREGADOR precisa e que o JSON-LD não dá.
//
// Ver research/autouncle-investigacao.md para o porquê de cada fonte.

import { normalizeCar, idFromUrl } from './schema.mjs';
import { BASE, MARKET } from './http.mjs';

// Substitui caracteres de controlo (U+0000–U+001F) por espaço. Construído sem chars de controlo no
// código-fonte. Defensivo: JSON com quebras/tabs literais dentro de strings rebenta o JSON.parse.
const CTRL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']+', 'g');

// (1) Extrai os itens do ItemList do JSON-LD → { items[], total }.
export function extractJsonLd(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let j;
    try { j = JSON.parse(m[1].replace(CTRL, ' ')); } catch { continue; }
    const graph = j['@graph'] || (Array.isArray(j) ? j : [j]);
    const list = graph.find((o) => o && o['@type'] === 'ItemList');
    if (list && Array.isArray(list.itemListElement)) {
      return {
        items: list.itemListElement.map((e) => e.item).filter(Boolean),
        total: typeof list.numberOfItems === 'number' ? list.numberOfItems : null,
      };
    }
  }
  return { items: [], total: null };
}

// Desembrulha e concatena o payload RSC (`self.__next_f.push([n,"…"])`). Cada string é um literal JS
// escapado → JSON.parse de `"…"` desescapa-a. Devolve o blob concatenado (ou '').
export function extractRscBlob(html) {
  const re = /self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  const parts = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try { parts.push(JSON.parse(m[1])); } catch { /* chunk não-string (bootstrap) — ignorar */ }
  }
  return parts.join('');
}

// (2) Mapa carId → extras da fonte, lido do blob RSC. Ancoramos em cada `vdpPath` (presente em TODOS
// os cards, orgânicos e em destaque, e que contém o carId) e lemos os campos numa janela à volta:
// à frente vêm sourceName/imageUrls/equipmentVariant/…/outgoingPath; imediatamente ATRÁS vem o
// auRating (sequência `"carId":X,"auRating":N,"vdpPath":…`). Limitamos a janela ao próximo card para
// não misturar dados. O primeiro registo de cada id ganha (evita sobrepor com repetições do carrossel).
export function extractSourceMap(html) {
  const blob = extractRscBlob(html);
  const map = new Map();
  const anchors = [];
  const re = /"vdpPath":"\/pt\/d\/(\d+)-[^"]*"/g;
  let m;
  while ((m = re.exec(blob)) !== null) anchors.push({ id: m[1], idx: m.index });
  const pick = (win, k, cast) => { const r = new RegExp(k).exec(win); return r ? (cast ? cast(r[1]) : r[1]) : null; };
  for (let i = 0; i < anchors.length; i++) {
    const { id, idx } = anchors[i];
    if (map.has(id)) continue;
    const end = anchors[i + 1] ? Math.min(idx + 1500, anchors[i + 1].idx) : idx + 1500;
    const fwd = blob.slice(idx, end);
    const back = blob.slice(Math.max(0, idx - 90), idx);   // auRating fica logo antes do vdpPath
    let image = null;
    const im = /"imageUrls":\[("(?:[^"\\]|\\.)*")/.exec(fwd);
    if (im) { try { image = JSON.parse(im[1]); } catch { /* ignora */ } }
    const out = /"outgoingPath":"\/pt\/link-externo\/([^/"]+)\/\d+\/(\d+)"/.exec(fwd);
    map.set(id, {
      sourceName: pick(fwd, '"sourceName":"([^"]*)"'),
      auRating: pick(back, '"auRating":(\\d+)', Number),
      image,
      variant: pick(fwd, '"equipmentVariant":"([^"]*)"'),
      modelGeneration: pick(fwd, '"modelGeneration":"([^"]*)"'),
      laytime: pick(fwd, '"laytime":(\\d+)', Number),
      isPrivate: (() => { const r = /"isPrivateCar":(true|false)/.exec(fwd); return r ? r[1] === 'true' : null; })(),
      sourceSlug: out ? out[1] : null,
      sourceExternalId: out ? out[2] : null,
      youSave: pick(fwd, '"youSaveDifference":(-?\\d+)', Number),
      estimatedPrice: pick(fwd, '"estimatedPrice":"([^"]*)"'),
    });
  }
  return map;
}

// Parse completo de uma página → { listings, total }. Junta cada item JSON-LD com os extras RSC do
// mesmo carId (molde theparking). `forcedMake`: quando percorremos uma faceta de marca, carimba a
// marca autoritativamente (o JSON-LD já a traz, mas garante consistência de slug).
export function parseListingPage(html, { collectedAt = null, forcedMake = null } = {}) {
  const { items, total } = extractJsonLd(html);
  const sources = extractSourceMap(html);
  const listings = items.map((item) => {
    const id = idFromUrl(item['@id'] || item.offers?.url);
    const rec = normalizeCar(item, id ? sources.get(id) ?? {} : {}, { collectedAt });
    if (forcedMake && !rec.make) rec.make = forcedMake;
    return rec;
  });
  return { listings, total };
}

// readTotal: só o total da query (numberOfItems do ItemList) — usado p/ planear/relatar volume.
export function readTotal(html) {
  return extractJsonLd(html).total;
}

// Constrói o URL de listagem SSR.
// - brand: faceta via PATH SEO canónico (`/pt/carros-usados/{Marca}`). NUNCA por query `s[...]`
//   (proibido pelo robots). O nome da marca vem do config (já canónico); só URL-encode.
// - page: `?page=N` (N>1) — não contém `s[` → permitido pelo robots.
export function listingUrl({ brand = null, page = 1 } = {}) {
  let path = MARKET.listPath;
  if (brand) path += `/${encodeURIComponent(brand)}`;
  const qs = page > 1 ? `?page=${page}` : '';
  return `${BASE}${path}${qs}`;
}

// Extrai a lista de marcas (com contagens) do JSON da config API → [{ brand, count }], só count>0,
// ordenada por contagem desc (as densas primeiro). Semeia o modo --full.
export function parseBrands(config) {
  const all = config?.carModelsByBrandDetailed?.allBrands;
  if (!Array.isArray(all)) return [];
  return all
    .filter((b) => b && b.brand && (b.count || 0) > 0)
    .map((b) => ({ brand: b.brand, count: b.count || 0 }))
    .sort((a, b) => b.count - a.count);
}

// Chave de dedupe / identidade estável: o carId (fallback detail_url).
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
