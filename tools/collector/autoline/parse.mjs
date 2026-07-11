// autoline/parse.mjs — extração dos dados de uma página de listagem do autoline.pt.
//
// PADRÃO-MOLDE: theparking/autocasion (card HTML + JSON-LD juntos por ID). Aqui o CARD é a fonte
// PRIMÁRIA e o JSON-LD é ENRIQUECIMENTO — decisão deliberada:
//   • O card `<div class="item sales-list-item" data-code={ID}>` está SEMPRE presente e completo
//     (make, ano, km, combustível, norma Euro, local, vendedor, imagem, URL de detalhe, preço).
//   • O bloco JSON-LD `ItemList` está presente em ALGUMAS secções-país (ex. Bélgica: 23 Product
//     ricos com preço numérico/condição/carroçaria/potência) mas VEM VAZIO noutras (ex. GB, cujos
//     cards estão populados na mesma). Usá-lo como fonte primária deixaria cair silenciosamente
//     esses países. Por isso iteramos os CARDS e juntamos o Product (por ID) quando existe.
// Ver research/autoline-investigacao.md.

import { normalizeCard } from './schema.mjs';

// Descodifica as entidades HTML comuns (o card serve texto com `&amp;`, `&#39;`, `&eacute;`…).
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTIDADES[name.toLowerCase()] ?? m);
}

// Limpa um pedaço de HTML para texto simples (tira tags/imagens base64, descodifica entidades,
// colapsa espaços).
function texto(chunk) {
  const semTags = chunk.replace(/data:image\/[^"']+/g, '').replace(/<[^>]+>/g, ' ');
  return decodeEntities(semTags).replace(/\s+/g, ' ').trim();
}

// (1) Mapa ID → `Product` do JSON-LD `ItemList` (enriquecimento; pode vir VAZIO nalguns países).
// GOTCHA (como no theparking/autocasion): sanitizamos caracteres de controlo antes do JSON.parse.
export function extractProducts(html) {
  const map = new Map();
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!m[1].includes('ItemList')) continue;
    try {
      const j = JSON.parse(m[1].replace(/[\x00-\x1f]+/g, ' '));
      const els = Array.isArray(j?.itemListElement) ? j.itemListElement : [];
      for (const e of els) {
        const it = e && e.item;
        if (it && it['@type'] === 'Product') {
          const id = (/--(\d+)(?:$|[?#])/.exec(it.url || '') || [])[1];
          if (id) map.set(id, it);
        }
      }
      if (map.size) return map;
    } catch { /* bloco malformado — tentar o próximo */ }
  }
  return map;
}

// (2) Extrai os CARDS da página (fonte primária). Devolve um array de objetos-card por ordem de
// aparição. Dividimos o HTML nos inícios de cada `<div class="item sales-list-item"` (mais fiável
// que a tag de fecho, frágil com aninhamento).
export function extractCards(html) {
  const cards = [];
  const inicios = [];
  const marca = /<div class="item sales-list-item/gi;
  let m;
  while ((m = marca.exec(html)) !== null) inicios.push(m.index);
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i], inicios[i + 1] ?? html.length);
    const idm = /data-code="(\d+)"/.exec(chunk);
    if (!idm) continue;
    const flat = chunk.replace(/data:image\/[^"']+/g, '').replace(/\s+/g, ' ');
    const grab = (re) => { const x = re.exec(flat); return x ? x[1] : null; };

    const kmChunk = /title="quilometragem">([\s\S]*?)<\/div>/.exec(flat);
    const fuelM = /<span class="name">Combust[ií]vel<\/span>\s*<span class="value">([^<]+)<\/span>/i.exec(flat);
    const locM = /class="location-text"[^>]*>([\s\S]*?)<\/[a-z]+>/i.exec(flat);
    // vendedor: o NOME dentro de `branding-company-name` (a estrutura é
    //   <div class="branding-company-name" …> <div …tooltip…></div> NOME </div>  seguido por um
    //   `<div class="branding-years-on-site">` que NÃO queremos). Consumimos o div-tooltip interno
    //   (opcional) e capturamos só o nó de texto seguinte.
    const compM = /branding-company-name"[^>]*>\s*(?:<div[^>]*>[\s\S]*?<\/div>\s*)?([^<]*?)\s*<\/div>/i.exec(flat);
    // preço do card: o `price-value`. Numérico ("1 850 €") em preço fixo; "Leilão"/negociado nos
    // restantes (nesses casos o preço numérico, se existir, vem do JSON-LD).
    const priceM = /class="price-value[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(flat);
    const priceTxt = priceM ? texto(priceM[1]) : null;

    cards.push({
      id: idm[1],
      make: grab(/data-brand="([^"]*)"/),
      name: grab(/data-name="([^"]*)"/) && decodeEntities(grab(/data-name="([^"]*)"/)),
      year: grab(/title="ano">\s*([0-9]{4}(?:-[0-9]{2})?)/),
      km: kmChunk ? (/([\d  .]+)\s*km/i.exec(texto(kmChunk[1]) + ' km') || [])[1]?.replace(/[\s.]/g, '') || null : null,
      fuel: fuelM ? texto(fuelM[1]) : null,
      euro: grab(/title="Euro">\s*([^<]+?)\s*</),
      locText: locM ? texto(locM[1]) : null,
      company: compM ? texto(compM[1]) || null : null,
      image: grab(/(https:\/\/img\.linemedia\.com\/[^"'  ]+\.jpg[^"'  ]*)/),
      detail_url: grab(/href="(https:\/\/[^"]*\/-\/[^"]*--\d+)"/),
      priceText: priceTxt,
      auction: /auction-bid|\/-\/leil[ãa]o\/|em leil[ãa]o/i.test(chunk),
    });
  }
  return cards;
}

// (3) Parse completo de uma página → { listings, total }.
// Itera os CARDS (spine) e junta o Product do JSON-LD por ID quando existe.
export function parseListingPage(html, { collectedAt = null, countryCode = null } = {}) {
  const products = extractProducts(html);
  const cards = extractCards(html);
  const listings = cards.map((c) => normalizeCard(c, products.get(c.id) || null, { collectedAt, countryCode }));
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query. O HTML repete " anúncios" em widgets vazios; procuramos a 1ª
// ocorrência com dígitos reais. Devolve null se não encontrar.
export function readTotal(html) {
  for (const m of html.matchAll(/([\d][\d  .]*)\s*an[uú]ncios/gi)) {
    const n = Number(m[1].replace(/[\s.]/g, ''));
    if (n > 0) return n;
  }
  return null;
}

// Facets de PAÍS para o modo --full: o site expõe `<a … href="/-/{cat}/{Pais}--c{cat}cnt{CC}">`
// para cada país europeu com stock (DE/BE/GB/FR/ES/CH…). Extraímos {cc, slug} desses links — é a
// partição path-based e robots-clean que cobre todo o stock UE de ligeiros (cada país pagina até
// ao fim). Devolve pares { cc, slug } únicos.
export function extractCountryFacets(html) {
  const out = new Map();
  const re = /href="[^"]*\/-\/[a-z-]+\/([A-Za-zÀ-ú-]+)--c\d+cnt([A-Z]{2})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cc = m[2];
    if (!out.has(cc)) out.set(cc, { cc, slug: m[1] });
  }
  return [...out.values()];
}

// Chave de dedupe / sinal de recência: o ID (data-code). É um timestamp de criação (YYMMDDHHMMSS+…)
// → id maior = anúncio mais recente. O schema descodifica-o em `created_at` (recência real).
export function recordId(rec) {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
