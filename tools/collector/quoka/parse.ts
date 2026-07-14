// quoka/parse.ts — extração dos dados de uma página de listagem do quoka.de.
//
// PADRÃO-MOLDE: theparking/autocasion (JSON-LD + extras do card HTML, juntos por ID). Aqui o
// CARD é a fonte PRINCIPAL (mais rico: título, km, cidade/Bundesland, data, preço) e o JSON-LD
// `ItemList` é complementar (dá a cilindrada, que o card não tem, e serve de fallback a
// ano/fuel/preço/imagem). Join card↔JSON-LD pelo hash de 32 chars do URL do anúncio.
//
// Estrutura: 20 cards regulares (`class="article-item "`) — cobertos pelo JSON-LD — + ~1 card
// Premium promovido (`class="article-item"`) que NÃO está no JSON-LD (só no HTML).

import { normalizeListing, type QuokaRecord, type RawCard } from './schema.ts';

const BASE = 'https://www.quoka.de';

// (1) JSON-LD `ItemList` → mapa hash → Vehicle. GOTCHA (como theparking): caracteres de controlo
// literais dentro das strings tornam o JSON inválido → sanitizamos antes de JSON.parse.
export function extractLdMap(html: string) {
  const map = new Map();
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const limpo = m[1].replace(/[\x00-\x1f]+/g, ' ');
    let j;
    try { j = JSON.parse(limpo); } catch { continue; }
    const items = j && j['@type'] === 'ItemList' ? j.itemListElement : null;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const id = hashDoUrl(it.url);
      if (id) map.set(id, it);
    }
  }
  return map;
}

// Hash de 32 chars antes de ".html" no URL de detalhe (chave de join/dedupe).
function hashDoUrl(url: string | null | undefined) {
  const m = /\/([0-9a-z]{32})\.html/i.exec(url || '');
  return m ? m[1] : null;
}

// Descodifica um pedaço de texto de HTML: remove tags e colapsa espaços (entidades tratadas
// depois no schema, para não perder informação).
function textOf(s: string | null | undefined): string | null {
  return s == null ? null : s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// Extrai o preço de um card: `span.new-price` (quando houve descida) ou o texto de
// `span.article-price` (preço normal, ex. "3 500 EUR"). Devolve {price, priceOld} em inteiros €.
function parsePreco(chunk: string) {
  const digits = (s: string) => { const d = (s || '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
  const nova = /class="new-price">([^<]+)</.exec(chunk);
  const velha = /class="old-price">([^<]+)</.exec(chunk);
  if (nova) return { price: digits(nova[1]), priceOld: velha ? digits(velha[1]) : null };
  // preço normal: o texto direto de article-price (pode ter <i> svg antes; pegamos o nº + EUR).
  const norm = /class="article-price">\s*([\d .]+)\s*EUR/.exec(chunk);
  return { price: norm ? digits(norm[1]) : null, priceOld: null };
}

// Lê `article-short-info` → { year, fuel, km } (linha "AAAA | combustível | NNN km").
function parseShortInfo(chunk: string) {
  const m = /article-short-info[\s\S]*?article-lbl-txt">\s*([\s\S]*?)\s*<\/span>/.exec(chunk);
  const txt = m ? textOf(m[1]) : null;
  if (!txt) return { year: null, fuel: null, km: null };
  const parts = txt.split('|').map((p) => p.trim()).filter(Boolean);
  let year = null, fuel = null, km = null;
  for (const p of parts) {
    if (/^\d{4}$/.test(p)) { year = Number(p); continue; }
    if (/^[\d .]+\s*km$/i.test(p)) { km = Number(p.replace(/[^\d]/g, '')); continue; }
    if (/^[a-zäöü/ -]+$/i.test(p) && fuel === null) fuel = p;
  }
  return { year, fuel, km };
}

// Extrai um card `article-item` a partir do seu pedaço de HTML → objeto "raw" para o schema.
function parseCard(chunk: string): RawCard | null {
  const id = (/\/anzeige\/[^"']*?\/([0-9a-z]{32})\.html/i.exec(chunk) || [])[1] || null;
  if (!id) return null;
  const href = (/href="(https?:\/\/[^"]*?\/anzeige\/[^"]*?\.html)"/i.exec(chunk) || [])[1]
    || `${BASE}/anzeigen/auto-motorrad/automarkt/anzeige/${id}.html`;
  const articleId = (/data-articleid="([^"]+)"/i.exec(chunk) || [])[1] || null;
  const title = textOf((/class="article-title"><a[^>]*>([\s\S]*?)<\/a>/i.exec(chunk) || [])[1]);
  const description = textOf((/class="article-description">([\s\S]*?)<\/p>/i.exec(chunk) || [])[1]);
  const loc = textOf((/class="article-location">[\s\S]*?<span>([\s\S]*?)<\/span>/i.exec(chunk) || [])[1]);
  const listingDate = textOf((/class="article-date">[\s\S]*?<span>([\s\S]*?)<\/span>/i.exec(chunk) || [])[1]);
  const img = (/class="art-img"[\s\S]*?<img[^>]*src="([^"]+)"/i.exec(chunk) || [])[1] || null;
  const images = Number((/article-img-count-number">\s*(\d+)/.exec(chunk) || [])[1]) || null;
  const { year, fuel, km } = parseShortInfo(chunk);
  const { price, priceOld } = parsePreco(chunk);
  // cidade, Bundesland → separa no último vírgula (a região é a última componente).
  let city = null, region = null;
  if (loc) { const i = loc.lastIndexOf(','); if (i >= 0) { city = loc.slice(0, i).trim(); region = loc.slice(i + 1).trim(); } else region = loc; }

  return {
    id, articleId, detailUrl: href, title, description,
    year, fuel, km, price, priceOld, city, region, listingDate,
    image: img && !/no_img\.png/i.test(img) ? img : null, images,
    premium: /class="art-promoted"/.test(chunk),
    verifiedPhone: /article-lbl-validated-phone/.test(chunk),
  };
}

// Parse completo de uma página → { listings, total }. `brandHint` (slug do --full/--brand) fixa a
// marca. Dividimos o HTML nos inícios de cada `class="article-item"` (mais fiável que a tag de
// fecho) e juntamos cada card ao seu Vehicle do JSON-LD pelo hash.
export function parseListingPage(html: string, { collectedAt = null, brandHint = null }: { collectedAt?: string | null; brandHint?: string | null } = {}): { listings: QuokaRecord[]; total: number | null } {
  const ldMap = extractLdMap(html);
  const inicios: number[] = [];
  const marca = /class="article-item ?"/gi;
  let m;
  while ((m = marca.exec(html)) !== null) inicios.push(m.index);
  const listings = [];
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i], inicios[i + 1] ?? html.length);
    const card = parseCard(chunk);
    if (!card) continue;
    listings.push(normalizeListing(card, { ld: ldMap.get(card.id) || null, brandHint, collectedAt }));
  }
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query (contador `var resultscount = N;` no HTML). NOTA: o site declara um
// número aparentemente inflacionado (ver research). Devolve null se não encontrar.
export function readTotal(html: string): number | null {
  const m = /resultscount\s*=\s*(\d+)/.exec(html);
  return m ? Number(m[1]) : null;
}

// Slugs de marca para o --full: links `/anzeigen/auto-motorrad/automarkt/{slug}/`. O mesmo padrão
// serve marcas E Bundesländer → excluímos os 16 estados e as subcategorias que não são marcas.
const NAO_MARCA = new Set([
  'baden-wuerttemberg', 'bayern', 'berlin', 'brandenburg', 'bremen', 'hamburg', 'hessen',
  'mecklenburg-vorpommern', 'niedersachsen', 'nordrhein-westfalen', 'rheinland-pfalz', 'saarland',
  'sachsen', 'sachsen-anhalt', 'schleswig-holstein', 'thueringen',
  'anzeige', 'nutzfahrzeuge', 'reifen-und-felgen', 'wohnmobile-wagen', 'auto-specials', 'altele',
]);
export function extractBrandSlugs(html: string): string[] {
  const set = new Set<string>();
  const re = /\/anzeigen\/auto-motorrad\/automarkt\/([a-z0-9-]+)\/(?=["?])/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const s = m[1].toLowerCase();
    if (!NAO_MARCA.has(s)) set.add(s);
  }
  return [...set];
}

// Chave de dedupe / join: o hash do anúncio.
export function recordId(rec: QuokaRecord): string | null {
  return rec.id || rec.detail_url || null;
}
