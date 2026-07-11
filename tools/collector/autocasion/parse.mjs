// autocasion/parse.mjs — extração dos dados de uma página de listagem do autocasion.com.
//
// PADRÃO-MOLDE: theparking (JSON-LD + extras do card HTML juntos por ID), NÃO o __NEXT_DATA__
// do autotrader/autoboerse. É a mesma família OParking/theparking já validada.
//
// Fonte principal = 1 bloco `application/ld+json` por página = ARRAY de 26 `Product`. Cada
// Product traz `offers.itemOffered` = `Car` com `EngineSpecification` embutido (campos ricos:
// make/model/variant/year/km/gearbox/power/color/doors/category/price/url/image/identifier).
//
// FALTAM ao JSON-LD: `fuel`, `região` e `dealer` → vêm do CARD HTML (padrão theparking). Cada
// card `<article class="anuncio">` tem um `<ul>` com [ano, combustível, km, província] e um
// `<div class="concesionario">` com nome + rating. Juntamos card↔JSON-LD pelo `identifier`
// (= o `ref…` do URL / o `data-product-key` do card).

import { normalizeProduct } from './schema.mjs';

// Combustíveis conhecidos na listagem (para identificar o <li> do combustível, seja qual for a
// posição — cards "Km0" metem um badge extra que desloca os índices).
const FUEL = /(gasolina|di[eé]sel|el[eé]ctrico|h[ií]brido|glp|gnc|etanol|hidr[oó]geno)/i;

// (1) Extrai o array de `Product` do único bloco JSON-LD da página.
// GOTCHA (como no theparking): sanitizamos caracteres de controlo (quebras/tabs literais dentro
// de strings) que tornariam o JSON inválido, antes de `JSON.parse`.
export function extractProducts(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const limpo = m[1].replace(/[\x00-\x1f]+/g, ' ');
    try {
      const j = JSON.parse(limpo);
      const arr = Array.isArray(j) ? j : [j];
      const products = arr.filter((x) => x && x['@type'] === 'Product');
      if (products.length) return products;
    } catch { /* bloco não-Product ou malformado — tentar o próximo */ }
  }
  return [];
}

// Lê a lista de `<li>` do card e devolve {fuel, region} (o resto — ano/km — vem do JSON-LD).
// Robusto à presença do badge "Km0" (li extra): identifica por padrão, não por índice.
function parseCardUl(chunk) {
  let lis = null;
  for (const m of chunk.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/g)) {
    const items = [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .map((x) => x[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    // O <ul> de detalhes é o que tem um ano (4 dígitos) E um valor em km.
    if (items.some((t) => /^\d{4}$/.test(t)) && items.some((t) => /^\d[\d.]*\s*km$/i.test(t))) {
      lis = items; break;
    }
  }
  if (!lis) return { fuel: null, region: null };
  let fuel = null;
  const rest = [];
  for (const t of lis) {
    if (/^\d{4}$/.test(t)) continue;                 // ano (já vem do JSON-LD)
    if (/^\d[\d.]*\s*km$/i.test(t)) continue;         // km (já vem do JSON-LD)
    if (fuel === null && FUEL.test(t)) { fuel = t; continue; }
    if (/^km0$/i.test(t)) continue;                   // badge de condição, não é província
    rest.push(t);
  }
  return { fuel, region: rest.length ? rest[rest.length - 1] : null };
}

// Extrai o bloco do concesionário do card → {dealer, dealer_rating}. Cards de particular não
// têm este bloco → devolve nulls.
function parseCardDealer(chunk) {
  const bloco = /<div class="concesionario">([\s\S]*?)<\/div>/.exec(chunk);
  if (!bloco) return { dealer: null, dealer_rating: null };
  const nome = /<p>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/.exec(bloco[1]);
  const rat = /circulo[^"]*">\s*([\d.,]+)\s*\/\s*\d/.exec(bloco[1]);
  return {
    dealer: nome ? nome[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null : null,
    dealer_rating: rat ? Number(rat[1].replace(',', '.')) : null,
  };
}

// (2) Mapa identifier → extras do card {fuel, region, dealer, dealer_rating, certified}.
// Dividimos o HTML nos inícios de cada `<article class="anuncio">` (mais fiável do que depender
// da tag de fecho, frágil com aninhamento) e analisamos o pedaço de cada card.
export function extractCardExtras(html) {
  const map = new Map();
  const inicios = [];
  const marca = /<article class="anuncio/gi;
  let m;
  while ((m = marca.exec(html)) !== null) inicios.push(m.index);
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i], inicios[i + 1] ?? html.length);
    const idm = /data-product-key=["']?(\d+)/.exec(chunk) || /-ref(\d+)/.exec(chunk);
    if (!idm) continue;
    const id = Number(idm[1]);
    const { fuel, region } = parseCardUl(chunk);
    const { dealer, dealer_rating } = parseCardDealer(chunk);
    map.set(id, { fuel, region, dealer, dealer_rating, certified: /class="certificado"/.test(chunk) });
  }
  return map;
}

// (3) Parse completo de uma página → { listings, total }.
// Junta cada Product (JSON-LD) com os extras do card pelo `identifier`.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const products = extractProducts(html);
  const extras = extractCardExtras(html);
  const listings = products.map((p) => {
    const id = p.offers?.itemOffered?.identifier ?? null;
    return normalizeProduct(p, { extras: (id != null ? extras.get(id) : null) || {}, collectedAt });
  });
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query (contador "122.702 Coches" no HTML). Devolve null se não encontrar.
export function readTotal(html) {
  const m = /([\d.]+)\s*Coches/.exec(html);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

// Slugs de marca para o modo --full: as páginas SEO `/coches-segunda-mano/{marca}-ocasion`
// (um só segmento a terminar em `-ocasion`). Extraídos dos links da página.
export function extractBrandSlugs(html) {
  const set = new Set();
  const re = /\/coches-segunda-mano\/([a-z0-9-]+)-ocasion(?=["'?])/gi;
  let m;
  while ((m = re.exec(html)) !== null) set.add(m[1].toLowerCase());
  return [...set];
}

// Chave de dedupe / sinal de recência: o `identifier` (id crescente = mais recente).
export function recordId(rec) {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
