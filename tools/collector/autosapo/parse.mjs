// autosapo/parse.mjs — extração dos dados das páginas do auto.sapo.pt.
//
// PADRÃO-MOLDE: cartões HTML SSR (família theparking/autocasion), mas SEM JSON-LD na listagem — o
// auto.sapo.pt não embute JSON-LD nem estado JS na página de pesquisa; cada anúncio é um
// `<article class="vehicle-card">` com microdados esparsos. Extraímos campo a campo do cartão.
//
// FONTE PRIMÁRIA (cobertura + rapidez) = a LISTAGEM. Cada página `/carros-usados?p=N` traz 20
// cartões com: id (ObjectId de 24 hex no href `/carro-usado/{id}/{slug}`), marca+modelo (h3),
// variante+potência+portas (o `<span>`), ano/km/combustível (os `<li>`), preço e imagem.
//
// FONTE OPCIONAL (enriquecimento, `--detail`) = a página de DETALHE. Traz um `dataLayer.push({…})`
// (analytics) LIMPO e estruturado (marca, modelo, versão, cor, combustível, carroçaria, portas,
// lugares, `nacional`, `vendedor`=particular/profissional) + um bloco JSON-LD (transmissão, VIN,
// cilindrada, tração, interior) + microdados de morada (distrito/concelho, stand). É 1 pedido por
// anúncio → só se justifica em amostras/fatias, não no catálogo inteiro (~24k). Ver investigação.

import { normalizeCard, applyDetail } from './schema.mjs';

// Path da listagem e da taxonomia de marcas (sitemap XML no robots).
export const LISTING_PATH = '/carros-usados';
export const BRANDS_SITEMAP = '/sitemap/carros-usados/marcas';

// `orderby` (probes ao pesquisa.js): 0=Destacados (default), 1=Mais recente, 2=Mais antigos,
// 3/4=Ano, 5/6=Preço, 7/8=Kms. O SSR HONRA o sort. Usamos '1' no watch (recência); no batch o
// default (Destacados) é o mais limpo para paginar (os "Em destaque" só aparecem na 1ª página).
export const ORDER_RECENTE = '1';

// Combustíveis que aparecem no cartão (para identificar o <li> certo, seja qual for a posição).
const FUEL = /(gasolina|diesel|di[eé]sel|el[eé]ctrico|el[ée]trico|h[íi]brido|gpl|gnc|el[eé]trico|gás|hidrog[eé]nio)/i;

// slugify: minúsculas, sem acentos, não-alfanum → '-'. Iguala o texto do h3 aos slugs do sitemap
// de marcas (ex. "Land Rover" → "land-rover", "Mercedes-Benz" → "mercedes-benz").
export function slugify(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// (1) Marcas (para separar marca/modelo do h3 e para o --full por marca). Lê os slugs do sitemap
// XML `/carros/{marca}.html`. Devolve um Set de slugs (ex. {"volvo","mercedes-benz","land-rover"}).
export function extractBrandSlugs(xml) {
  const set = new Set();
  const re = /\/carros\/([a-z0-9-]+)\.html/gi;
  let m;
  while ((m = re.exec(String(xml ?? ''))) !== null) set.add(m[1].toLowerCase());
  return set;
}

// ObjectId (24 hex) → data ISO. Os primeiros 4 bytes do ObjectId são o timestamp Unix de criação
// do anúncio → é o nosso sinal de RECÊNCIA (o cartão não expõe data). Null se o id não for válido.
export function oidToDate(oid) {
  if (!/^[0-9a-f]{24}$/i.test(String(oid ?? ''))) return null;
  const secs = parseInt(String(oid).slice(0, 8), 16);
  return Number.isFinite(secs) ? new Date(secs * 1000).toISOString() : null;
}

// (2) Extrai os cartões de uma página de listagem em objetos "crus" (strings ainda por normalizar).
// Dividimos nos inícios de cada `<article class="vehicle-card">` (mais robusto que depender do fecho).
function extractCards(html) {
  const cards = [];
  const marca = /<article class="vehicle-card([^"]*)">/gi;
  const inicios = [];
  let m;
  while ((m = marca.exec(html)) !== null) inicios.push({ idx: m.index, cls: m[1] });
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i].idx, inicios[i + 1]?.idx ?? html.length);
    const href = /\/carro-usado\/([0-9a-f]{24})\/([^"?]+)/i.exec(chunk);
    if (!href) continue;
    // h3: âncora com [marca+modelo] e um <span> com [variante -] potência - portas.
    const h3 = /<h3 itemprop="name">\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
    let makeModel = null, span = null;
    if (h3) {
      const sp = /([\s\S]*?)<span>([\s\S]*?)<\/span>/i.exec(h3[1]);
      makeModel = limpa(sp ? sp[1] : h3[1]);
      span = sp ? limpa(sp[2]) : null;
    }
    // <li>: ano (4 díg.), km (…km), combustível (palavra conhecida) — por padrão, não por índice.
    const lis = [...chunk.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((x) => limpa(x[1])).filter(Boolean);
    // preço: <div class="price"><span>39.990<small>€</small>…
    const precoM = /<div class="price">[\s\S]*?<span>\s*([\d.\s]+)/i.exec(chunk);
    // imagem: usa o <img src> do cartão (relativo → absolutizado no schema).
    const imgM = /<img[^>]*\bsrc="([^"]+)"[^>]*itemprop="image"/i.exec(chunk)
      || /<img[^>]*itemprop="image"[^>]*\bsrc="([^"]+)"/i.exec(chunk);
    cards.push({
      id: href[1].toLowerCase(),
      slug: href[2],
      makeModel,
      span,
      lis,
      priceRaw: precoM ? precoM[1] : null,
      imageRaw: imgM ? imgM[1] : null,
      highlighted: /\bhighlighted\b/.test(inicios[i].cls),
    });
  }
  return cards;
}

// Descodifica entidades HTML comuns + colapsa espaços.
function limpa(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// Divide "marca modelo" usando o Set de marcas: tenta o slug dos 2 primeiros tokens, depois 1.
// Ex. "Land Rover Range Rover Sport" → make "Land Rover", model "Range Rover Sport". Fallback: 1º token.
export function splitMakeModel(makeModel, brandSet) {
  const raw = limpa(makeModel);
  if (!raw) return { make: null, model: null };
  const tokens = raw.split(' ');
  if (brandSet && brandSet.size) {
    for (let k = Math.min(2, tokens.length); k >= 1; k--) {
      const cand = slugify(tokens.slice(0, k).join(' '));
      if (brandSet.has(cand)) {
        return { make: tokens.slice(0, k).join(' '), model: tokens.slice(k).join(' ') || null };
      }
    }
  }
  return { make: tokens[0], model: tokens.slice(1).join(' ') || null };
}

// Interpreta o <span> do h3 → { variant, power_cv, doors }. Formato: "[variante -] Ncv - NP"
// (o último segmento são as portas, o penúltimo a potência; o resto, se houver, é a variante).
export function parseSpan(span) {
  const s = limpa(span);
  if (!s) return { variant: null, power_cv: null, doors: null };
  const parts = s.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  let power_cv = null, doors = null;
  const last = parts[parts.length - 1];
  const dm = /^(\d+)\s*P$/i.exec(last || '');
  if (dm) { doors = Number(dm[1]); parts.pop(); }
  const pen = parts[parts.length - 1];
  const pm = /^(\d+)\s*cv$/i.exec(pen || '');
  if (pm) { power_cv = Number(pm[1]); parts.pop(); }
  const variant = parts.join(' - ').trim() || null;
  return { variant, power_cv, doors };
}

// (3) Parse completo de uma página de listagem → { listings, total }.
export function parseListingPage(html, { brandSet = null, collectedAt = null } = {}) {
  const listings = extractCards(html).map((c) => normalizeCard(c, { brandSet, collectedAt }));
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query: "Pág. 1 de 1.218 / 24.355 viaturas". Devolve null se não encontrar.
export function readTotal(html) {
  const m = /\/\s*([\d.]+)\s*viaturas/i.exec(html);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

// Nº de páginas da query ("… de 1.218 …"). Null se não encontrar.
export function readPages(html) {
  const m = /P[áa]g\.?\s*[\d.]+\s*de\s*([\d.]+)/i.exec(html);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

// Validador para o fetchText do lib: a página é útil só se trouxer cartões (o rate-limit por rajada
// devolve páginas SEM cartões → tratamos como retryável).
export const temCartoes = (t) => /class="vehicle-card/.test(t);

// --- enriquecimento (--detail): parse da página de DETALHE ---------------------
//
// (A) dataLayer.push({...}) — objeto analytics limpo. Não é JSON puro (o `vendedor` é uma expressão
// ternária JS), por isso extraímos os pares chave→valor com regex tolerante (mais simples e seguro
// que avaliar JS de terceiros num vm — a payload é trivial). Devolve {} se não existir.
function parseDataLayer(html) {
  const i = html.indexOf('dataLayer.push({');
  if (i < 0) return {};
  const bloco = html.slice(i, html.indexOf('})', i) + 1);
  const out = {};
  for (const m of bloco.matchAll(/'([a-zA-Z]+)'\s*:\s*(?:'([^']*)'|(\d+))/g)) {
    const val = m[2] !== undefined ? m[2] : m[3];
    if (!(m[1] in out)) out[m[1]] = val; // 1ª ocorrência (evita apanhar o 2º 'True' do ternário)
  }
  return out;
}

// (B) JSON-LD do detalhe (1 bloco): transmissão, VIN, cilindrada, tração, cores/interior, morada.
function parseDetailJsonLd(html) {
  const m = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {};
  try { return JSON.parse(m[1].replace(/[\x00-\x1f]+/g, ' ')); } catch { return {}; }
}

// (C) microdados de morada + nome do stand (da streetAddress) e cilindrada (da vehicleConfiguration/
// description). addressRegion = DISTRITO (ex. "Lisboa"); addressCountry vem mal-rotulado = CONCELHO.
export function parseDetail(html) {
  const dl = parseDataLayer(html);
  const ld = parseDetailJsonLd(html);
  const reg = /itemprop="addressRegion"[^>]*>([^<]*)</i.exec(html);
  const con = /itemprop="addressCountry"[^>]*>([^<]*)</i.exec(html);
  const street = /itemprop="streetAddress"[^>]*>([^<]*)</i.exec(html);
  const desc = ld.description || '';
  const dealerM = /\bpor\s+([^.,]+?)\s*$/i.exec(desc);            // "…à venda em X por {stand}"
  const ccM = /(\d{3,5})\s*cc/i.exec(ld.vehicleConfiguration || desc || '');
  return {
    gearbox: ld.vehicleTransmission || null,
    color: dl.cor || ld.color || null,
    category: dl.carrocaria || ld.bodyType || null,
    region: reg ? limpa(reg[1]) : null,                          // distrito
    locality: (con ? limpa(con[1]) : null) || dl.localizacao || null, // concelho/freguesia
    seats: dl.assentos ? Number(dl.assentos) : null,
    engine_cc: ccM ? Number(ccM[1]) : null,
    vin: ld.vehicleIdentificationNumber || null,
    interior_color: ld.vehicleInteriorColor || null,
    interior_type: ld.vehicleInteriorType || null,
    drive_train: (ld.driveWheelConfiguration || '').replace('https://schema.org/', '') || null,
    seller_type: dl.vendedor === 'True' ? 'profissional' : (dl.vendedor === 'False' ? 'particular' : null),
    national: dl.nacional === 'True' ? true : (dl.nacional === 'False' ? false : null),
    dealer: dealerM ? limpa(dealerM[1]) : (street ? limpa(street[1]) : null),
  };
}

// Junta os extras do detalhe a um registo já normalizado (delegado ao schema).
export function enrich(rec, detailExtras) {
  return applyDetail(rec, detailExtras);
}

// Chave de dedupe / identidade: o ObjectId (também codifica a recência via timestamp).
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
