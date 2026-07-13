// autopt/parse.mjs — extração dos dados de uma página de listagem do auto.pt (`/carros-usados`).
//
// PADRÃO-MOLDE: quoka/theparking/autocasion (card HTML + JSON-LD juntos por id). Aqui o CARD é a
// fonte PRINCIPAL (id, URL, título, preço, vendedor, distrito, [combustível/ano/km]) e o JSON-LD
// `Vehicle` enriquece (marca/modelo separados, imagem, condição).
//
// GEOMETRIA DA PÁGINA (SSR Symfony, 20 anúncios/página, confirmado):
//   • 20 cards `<a data-testid="car_listing_entry" id="item_XXXX">` (XXXX = referenceNumber).
//   • 1 bloco JSON-LD `WebPage` cujo `mainEntity` é um `OfferCatalog` com 20 `Offer.itemOffered`
//     (`Vehicle`) — SEM url/id, alinhados por POSIÇÃO.
//   • 1 bloco JSON-LD `ItemList` com 20 `ListItem` {position, url} — o url traz o id (`…-id-XXXX`).
// Join: ItemList[i] dá (id, url) e OfferCatalog[i] dá o Vehicle → mapa id→vehicle. O card junta-se
// por id (o seu). Alinhamento 20/20/20 verificado em várias páginas (ver investigação).

import { normalizeListing } from './schema.mjs';
import { BASE } from './http.mjs';

// id do anúncio = o sufixo alfanumérico depois de "-id-" no URL de detalhe (chave de dedupe/join).
function idFromUrl(url) {
  const m = /-id-([A-Za-z0-9]+)(?:[/?#]|$)/.exec(url || '');
  return m ? m[1] : null;
}

// Vocabulário de combustíveis da listagem (para classificar o <li> certo, seja qual for a ordem).
const FUEL = /^(gasolina|g[aá]sole?o|di[eé]sel|el[eé]ctrico|el[eé]trico|h[ií]brido|gpl|gnc|gn[vc]|hidrog[eé]nio|etanol|outro)/i;

// (1) JSON-LD: constrói o mapa id→Vehicle (via ItemList para os ids + OfferCatalog para os veículos).
// GOTCHA (como theparking): caracteres de controlo literais dentro das strings tornam o JSON
// inválido → sanitizamos antes de JSON.parse.
export function extractVehicleMap(html) {
  const map = new Map();
  let vehicles = null;   // array posicional (OfferCatalog)
  let items = null;      // array posicional (ItemList) com {position, url}
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let j;
    try { j = JSON.parse(m[1].replace(/[\x00-\x1f]+/g, ' ')); } catch { continue; }
    if (j && j['@type'] === 'WebPage' && Array.isArray(j.mainEntity?.itemListElement)) {
      vehicles = j.mainEntity.itemListElement.map((o) => o.itemOffered || o);
    }
    if (j && j['@type'] === 'ItemList' && Array.isArray(j.itemListElement)) {
      items = j.itemListElement;
    }
  }
  if (items && vehicles) {
    // Alinhamento por posição: ItemList vem ordenado por `position` (1..N) tal como o OfferCatalog.
    const sorted = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
    for (let i = 0; i < sorted.length; i++) {
      const id = idFromUrl(sorted[i].url);
      if (id && vehicles[i]) map.set(id, vehicles[i]);
    }
  }
  return map;
}

// Descodifica um pedaço de HTML em texto: remove tags e colapsa espaços (entidades no schema).
function textOf(s) {
  return s == null ? null : s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// (2) Extrai um card (a partir do seu pedaço de HTML) → objeto "raw" para o schema.
function parseCard(chunk, id) {
  const href = (/href="(\/carros-usados\/[^"]+?-id-[A-Za-z0-9]+)"/.exec(chunk) || [])[1];
  const detailUrl = href ? `${BASE}${href}` : null;
  const titleMake = textOf((/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(chunk) || [])[1]);
  const variant = textOf((/<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(chunk) || [])[1]);
  const priceTxt = (/bg-primary[^>]*>\s*([\d\s.]+?)\s*€/.exec(chunk) || [])[1];
  const price = priceTxt ? Number(priceTxt.replace(/[^\d]/g, '')) : null;

  // Bloco vendedor+distrito: `<div class="mt-5 h-5 flex items-center"> … </div>`. Um STAND traz um
  // span `text-primary line-clamp-1` (nome); um PARTICULAR só traz o span de distrito.
  const bloco = (/mt-5 h-5 flex items-center">([\s\S]*?)<\/div>/.exec(chunk) || [])[1] || '';
  const seller = textOf((/text-primary line-clamp-1[^>]*>([\s\S]*?)<\/span>/.exec(bloco) || [])[1]);
  const district = textOf((/text-grey-700 text-sm">([\s\S]*?)<\/span>/.exec(bloco) || [])[1]);

  // <ul> de 3 itens [combustível, ano, km] — classificamos por padrão, não por posição.
  const ul = (/<ul class="mt-auto[^>]*>([\s\S]*?)<\/ul>/.exec(chunk) || [])[1] || '';
  const lis = [...ul.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => textOf(x[1])).filter(Boolean);
  let fuel = null, year = null, km = null;
  for (const t of lis) {
    if (/^\d{4}$/.test(t)) { year = Number(t); continue; }
    if (/km$/i.test(t)) { km = Number(t.replace(/[^\d]/g, '')) || null; continue; }
    if (fuel === null && FUEL.test(t)) fuel = t;
  }

  // Imagem: o atributo `src` real (não o background base64 de placeholder).
  const image = (/<img[^>]*\ssrc="(https:\/\/images\.auto\.pt\/[^"]+)"/.exec(chunk) || [])[1] || null;

  return { id, detailUrl, titleMake, variant, price, seller, district, fuel, year, km, image };
}

// (3) Parse completo de uma página → { listings, total }. Dividimos o HTML nos inícios de cada card
// (mais fiável que a tag de fecho, frágil com aninhamento) e juntamos cada card ao seu Vehicle.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const vehMap = extractVehicleMap(html);
  const marca = /<a href="\/carros-usados\/[^"]+?-id-[A-Za-z0-9]+"\s+data-testid="car_listing_entry"\s+id="item_([A-Za-z0-9]+)"/g;
  const starts = [];
  let m;
  while ((m = marca.exec(html)) !== null) starts.push([m.index, m[1]]);
  const listings = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = html.slice(starts[i][0], starts[i + 1] ? starts[i + 1][0] : starts[i][0] + 9000);
    const card = parseCard(chunk, starts[i][1]);
    if (!card.id) continue;
    listings.push(normalizeListing(card, { veh: vehMap.get(card.id) || null, collectedAt }));
  }
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query — o `numberOfItems` do JSON-LD `ItemList` (ex. 16241 em /carros-usados).
export function readTotal(html) {
  const m = /"numberOfItems":\s*(\d+)/.exec(html);
  return m ? Number(m[1]) : null;
}

// Slugs de marca para o modo --full: as `<option>` do filtro `<select name="search[make]">`.
// Um só `<select>` (o de marca) tem 100+ opções com value alfanumérico-hífen → devolvemos os slugs.
export function extractMakeSlugs(html) {
  const sel = /<select[^>]*name="search\[make\]"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  if (!sel) return [];
  const set = new Set();
  const re = /<option value="([a-z0-9][a-z0-9-]*)"/gi;
  let m;
  while ((m = re.exec(sel[1])) !== null) set.add(m[1].toLowerCase());
  return [...set];
}

// Chave de dedupe / join: o referenceNumber do anúncio.
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
