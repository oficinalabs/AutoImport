// santogal/parse.mjs — extração dos dados de uma página de listagem do santogal.pt
// (`/pt/search-page/?querytext=Usados&vehicletype=car`).
//
// PADRÃO-MOLDE: quoka/autopt (CARD HTML como fonte PRINCIPAL). Aqui NÃO há JSON-LD útil por
// anúncio — o único bloco `application/ld+json` da página é uma `Organization` (dados do site,
// não dos carros). Toda a informação do anúncio vem do CARD SSR.
//
// GEOMETRIA DA PÁGINA (SSR Umbraco, 40 anúncios/página, confirmado):
//   • 40 cards `<div class="card_car …" data-id="{nodeId}" data-detail-url="/{marca}/{modelo}/{id}/"
//     data-cacheddate="…" data-order="…" data-vehicle-src="…" data-push-object='{…JSON…}'>`.
//   • O `data-push-object` (JSON de analytics) traz marca, modelo/variante, tipo (Usado/Novo),
//     combustível e o `carroId` (= último segmento do URL de detalhe = chave natural do anúncio).
//   • O corpo do card traz `<h2 class="brand_label">` (marca), `<h3 class="model_label">`
//     (modelo+variante), dois `col-info-car` com [km, combustível] e [ano, cor] identificados por
//     `data-id="icon-{km|fuel|year|color}"`, e o preço em `<span class="price">` (+ `first-price`
//     riscado quando houve descida).
// Não há paginação por JSON — só `?pagina=N`. Um só bloco por card → sem join, ao contrário do
// autopt/autocasion (que cruzam card + JSON-LD).

import { normalizeListing } from './schema.mjs';
import { BASE } from './http.mjs';

// Descodifica um pedaço de HTML em texto: remove tags e colapsa espaços (entidades no schema).
function textOf(s) {
  return s == null ? null : s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// Lê o valor de um campo `col-info-car` pelo seu `data-id="icon-{tipo}"`. A estrutura é
//   <i class="icon … icon-{tipo} …" data-id="icon-{tipo}"> <svg>…</svg> </i> <span>VALOR</span>
// → capturamos o primeiro `<span>…</span>` que aparece depois do ícone (o valor legível).
function infoByIcon(chunk, tipo) {
  const re = new RegExp(`data-id="icon-${tipo}"[\\s\\S]*?<\\/i>\\s*<span>([\\s\\S]*?)<\\/span>`, 'i');
  const m = re.exec(chunk);
  return m ? textOf(m[1]) : null;
}

// Extrai e faz parse do `data-push-object` (JSON de analytics single-quoted). Traz marca, variante,
// tipo (Usado/Novo/…), combustível e carroId — um bom fallback/reforço aos campos do corpo do card.
function parsePushObject(chunk) {
  const m = /data-push-object='([^']*)'/.exec(chunk);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

// Extrai o preço de um card. `span.price` é o preço atual; `span.first-price` (quando não é só
// `&nbsp;`) é o preço ANTERIOR (riscado, houve descida). Devolve {price, priceOld} em inteiros €.
function parsePreco(chunk) {
  // ⚠️ removemos primeiro as entidades HTML (ex. o € = `&#x20AC;`, cujos "20" contaminariam o
  // número) e só depois extraímos os dígitos.
  const digits = (s) => {
    const d = (s || '').replace(/&#x?[0-9a-f]+;|&[a-z]+;/gi, '').replace(/[^\d]/g, '');
    return d ? Number(d) : null;
  };
  const cur = /<span class="price">([\s\S]*?)<\/span>/.exec(chunk);
  const old = /<span class="first-price">([\s\S]*?)<\/span>/.exec(chunk);
  const oldTxt = old ? old[1].replace(/&nbsp;|\s+/g, '') : '';
  return { price: cur ? digits(cur[1]) : null, priceOld: /\d/.test(oldTxt) ? digits(oldTxt) : null };
}

// (1) Extrai um card (a partir do seu pedaço de HTML) → objeto "raw" para o schema.
function parseCard(chunk) {
  const nodeId = (/^\s*<div class="card_car[^>]*\bdata-id="([^"]+)"/.exec(chunk) || [])[1]
    || (/data-id="([^"]+)"/.exec(chunk) || [])[1] || null;
  const detailPath = (/data-detail-url="([^"]+)"/.exec(chunk) || [])[1] || null;
  const push = parsePushObject(chunk);
  // carroId = último segmento numérico do URL de detalhe; fallback ao carroId do push-object.
  const id = (detailPath && (/\/(\d+)\/?$/.exec(detailPath) || [])[1]) || push.carroId || null;

  const make = textOf((/<h2 class="brand_label">([\s\S]*?)<\/h2>/.exec(chunk) || [])[1]) || push.marcaCarro || null;
  const variant = textOf((/<h3 class="model_label">([\s\S]*?)<\/h3>/.exec(chunk) || [])[1]) || push.modeloCarro || null;

  const km = infoByIcon(chunk, 'km');
  const fuel = infoByIcon(chunk, 'fuel') || push['Combustível'] || null;
  const year = infoByIcon(chunk, 'year');
  const color = infoByIcon(chunk, 'color');
  const { price, priceOld } = parsePreco(chunk);

  // Primeira imagem real do slider (o `src` do 1º `<img>`; as seguintes têm só `data-src` lazy).
  const image = (/<img[^>]*\ssrc="(\/media\/[^"]+)"/.exec(chunk) || [])[1] || null;

  return {
    id: id ? String(id) : null,
    nodeId,
    detailUrl: detailPath ? `${BASE}${detailPath}` : null,
    make, variant, km, fuel, year, color, price, priceOld, image,
    condition: push.tipoCarro || null,            // "Usado" | "Novo" | "Serviço" | "Km 0"
    src: (/data-vehicle-src="([^"]*)"/.exec(chunk) || [])[1] || null,
    order: (/data-order="([^"]*)"/.exec(chunk) || [])[1] || null,
    cachedDate: (/data-cacheddate="([^"]*)"/.exec(chunk) || [])[1] || null,
  };
}

// (2) Parse completo de uma página → { listings, total }. Dividimos o HTML nos inícios de cada
// card (`<div class="card_car`) — mais fiável que a tag de fecho, frágil com aninhamento.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const marca = /<div class="card_car\b/gi;
  const starts = [];
  let m;
  while ((m = marca.exec(html)) !== null) starts.push(m.index);
  const listings = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = html.slice(starts[i], starts[i + 1] ?? html.length);
    const card = parseCard(chunk);
    if (!card.id) continue;
    listings.push(normalizeListing(card, { collectedAt }));
  }
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query — o contador "Encontrados <strong>N veículos</strong>" do HTML.
export function readTotal(html) {
  const m = /Encontrados\s*<strong>\s*([\d.]+)\s*ve[íi]culos/i.exec(html);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

// Chave de dedupe / sinal de recência: o carroId (id de stock crescente = mais recente).
export function recordId(rec) {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
