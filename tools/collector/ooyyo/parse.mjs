// ooyyo/parse.mjs — extração dos dados de uma página de resultados (SRP) do Ooyyo (secção BE).
//
// FONTE: card HTML SERVER-RENDERED (não JSON-LD, não __NEXT_DATA__). A SRP
// `/belgium/…used-cars-for-sale/c=<code>/` traz ~15 `<a class="car-card-1">` por página, cada um
// com todos os campos no HTML (year/make/model/engine, preço em `data-price`, km, carroçaria+
// combustível, cidade, e o site de origem embutido no URL da imagem). É o molde "card HTML" (como
// os extras do theparking), mas AQUI o card é a fonte completa — não há JSON-LD a juntar.
//
// COMO CHEGAMOS À SRP: as páginas de país (`/belgium/c=<code>/`) NÃO trazem carros (só um template
// + `appParams` com um `count`). O inventário só se alcança pela API de quicksearch (ver
// qselements()), que devolve o URL da 1ª SRP (com um `code` determinístico) + o total + as marcas.
// A paginação faz-se SEGUINDO o link "Next" de cada SRP (o `code` codifica a página; incrementa a
// cada página, mas seguimos o href para não depender do cifrado).

import { normalizeCard } from './schema.mjs';
import { BASE, BE_PARAMS } from './http.mjs';

// Vocabulários para classificar os spans da `<div class="description">` (a ordem varia: pode vir
// [carroçaria, combustível], [combustível, cor], [carroçaria, combustível, cor], etc.). Em inglês
// porque a API usa idLanguage=47. Classificamos por PADRÃO (não por posição), como no autocasion.
const RE_FUEL = /^(diesel|petrol|gasoline|electric|hybrid|plug-?in|lpg|cng|hydrogen|ethanol|benzine)$/i;
const RE_BODY = /^(sedan|suv|hatchback|crossover|coupe|convertible|cabrio|mpv|van|pickup|pick-?up|wagon|estate|minivan|roadster|na)$/i;
const RE_COLOR = /^(black|white|gray|grey|silver|blue|red|green|yellow|orange|brown|beige|gold|purple|bronze|violet|pink)$/i;

// --- API quicksearch/qselements --------------------------------------------
// Endpoint (GET, JSON) que alimenta o formulário de busca e devolve, de borla, o URL da SRP com um
// `code` válido, o `count` (total de anúncios) e a lista de marcas (com contagens). Sem `code`
// próprio necessário. Servido em www.ooyyo.com (o host analytics.ooyyo.com é gated → "forbidden!").
export function qselementsUrl(extra = {}) {
  const params = { ...BE_PARAMS, qsType: 'advanced', ...extra };
  return `${BASE}/ooyyo-services/resources/quicksearch/qselements?json=${encodeURIComponent(JSON.stringify(params))}`;
}

// Parse da resposta qselements → { seedUrl, total, makes[] }.
//   seedUrl: URL absoluto da 1ª SRP (para os params dados; sem/com marca).
//   total:   nº de anúncios da query (int).
//   makes:   [{ idMake, name, urlName, count }] (top + "black" = restantes), para o modo --full.
export function parseQsElements(json) {
  let d;
  try { d = typeof json === 'string' ? JSON.parse(json) : json; } catch { return { seedUrl: null, total: null, makes: [] }; }
  const seedUrl = d.url ? (d.url.startsWith('http') ? d.url : BASE + d.url.replace(/^\/\//, '/')) : null;
  const total = d.count != null ? Number(String(d.count).replace(/[^\d]/g, '')) || null : null;
  const m = d.makes || {};
  const makes = [...(m.top || []), ...(m.black || [])]
    .filter((x) => x && x.idMake != null && x.name)
    .map((x) => ({ idMake: String(x.idMake), name: x.name, urlName: x.urlName, count: x.count || 0 }));
  return { seedUrl, total, makes };
}

// --- extração dos cards da SRP ---------------------------------------------

// Site de origem a partir do URL (proxy) da imagem: `images.ooyyo.com/media/…?url=<host>/…`.
// Devolve { host, domain }: host = host completo da origem (ex. "pictures-cdn.autolive.be");
// domain = domínio registável (2 últimos labels, ex. "autolive.be"). Fica null se não houver proxy.
function sourceFromImage(imgUrl) {
  if (!imgUrl) return { host: null, domain: null };
  const m = /[?&]url=([A-Za-z0-9.-]+)\//.exec(imgUrl);
  if (!m) return { host: null, domain: null };
  const host = m[1].toLowerCase();
  const parts = host.split('.');
  const domain = parts.length >= 2 ? parts.slice(-2).join('.') : host;
  return { host, domain };
}

// Extrai um único card (pedaço de HTML a começar em `<a class="car-card-1"`) → objeto de campos.
function parseCard(chunk) {
  const f = (re, g = 1) => { const m = re.exec(chunk); return m ? m[g].trim() : null; };

  const href = f(/href="([^"]+)"/);
  const detailUrl = href ? (href.startsWith('http') ? href : BASE + href.replace(/^\/\//, '/')) : null;
  const id = f(/data-record="(-?\d{3,})"/);            // hash único do registo (dedupe)
  const price = f(/data-price="([^"]*)"/);
  const currencyId = f(/data-currency="([^"]*)"/);
  const title = f(/title="([^"]*)"/);

  // Cabeçalho `<div class="mob-heading">`: spans [ano, marca, modelo, cilindrada].
  const head = /<div class="mob-heading">([\s\S]*?)<\/div>/.exec(chunk);
  const spans = head ? [...head[1].matchAll(/<span>([^<]*)<\/span>/g)].map((x) => x[1].trim()).filter(Boolean) : [];
  const year = spans[0] || null;
  const make = spans[1] || null;
  const model = spans[2] || null;
  const engine = spans[3] || null;                     // cilindrada textual (ex. "2.4"); pode faltar

  // km: `<div class="mileage"> Mi: <strong> 55,762 km </strong>`.
  const km = f(/class="mileage">\s*Mi:\s*<strong>\s*([\d.,]+)\s*km/i);

  // descrição: `<div class="description"><span>Suv,&nbsp;</span><span>Diesel,&nbsp;</span></div>`
  // → [carroçaria, combustível] (o combustível pode faltar).
  const descBlock = /<div class="description">([\s\S]*?)<\/div>/.exec(chunk);
  const desc = descBlock
    ? [...descBlock[1].matchAll(/<span>([^<]*)<\/span>/g)]
        .map((x) => x[1].replace(/&nbsp;/g, ' ').replace(/[,\s]+$/, '').trim()).filter(Boolean)
    : [];
  // Classifica por vocabulário (a ordem varia): carroçaria / combustível / cor. O que não casar
  // nenhum vocabulário fica como carroçaria de reserva (fallback) se ainda não houver uma.
  let category = null, fuel = null, color = null;
  for (const t of desc) {
    if (fuel === null && RE_FUEL.test(t)) { fuel = t; continue; }
    if (color === null && RE_COLOR.test(t)) { color = t; continue; }
    if (category === null && RE_BODY.test(t)) { category = t; continue; }
    if (category === null) category = t;               // token desconhecido → carroçaria de reserva
  }

  // localização: `<div class="mob-location"> Aalter, ... Belgium </div>`. Cidade = 1º segmento se
  // for diferente do país (cards sem cidade mostram só "Belgium").
  const locBlock = /<div class="mob-location">([\s\S]*?)<\/div>/.exec(chunk);
  let city = null;
  if (locBlock) {
    const parts = locBlock[1].replace(/<[^>]+>/g, ' ').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length && !/^belgium$/i.test(parts[0])) city = parts[0];
  }

  // imagem (proxy) e site de origem.
  const image = f(/data-src="([^"]+)"/);
  const { host: sourceHost, domain: source } = sourceFromImage(image);

  // extras: deal (rótulo) e % de poupança; contagem de fotos.
  const deal = f(/<div class="label">\s*([^<]+?)\s*<\/div>/);
  const savePercentRaw = f(/<span class="percent">[\s\S]*?([\d.,]+)\s*%/);
  const savePercent = savePercentRaw ? Number(savePercentRaw.replace(',', '.')) : null;
  const imageCountRaw = f(/<i class="icon-camera"><\/i><span>\s*([\d]+)\+?/);
  const imageCount = imageCountRaw ? Number(imageCountRaw) : null;

  return {
    id, price, currency: null, currencyId, title, year, make, model, engine, km,
    category, fuel, color, city, image, source, sourceHost, detailUrl, deal, savePercent, imageCount,
  };
}

// Divide a SRP nos inícios de cada `<a class="car-card-1"` e analisa cada pedaço. Ignora o card
// que é TEMPLATE Handlebars (contém `data-record="{{record}}"`) e cards sem id numérico.
export function extractCards(html) {
  const marca = /<a class="car-card-1"/gi;
  const inicios = [];
  let m;
  while ((m = marca.exec(html)) !== null) inicios.push(m.index);
  const cards = [];
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i], inicios[i + 1] ?? html.length);
    if (chunk.includes('data-record="{{')) continue;    // template, não é anúncio real
    const c = parseCard(chunk);
    if (!c.id) continue;                                  // sem id → descartar
    cards.push(c);
  }
  return cards;
}

// Link "Next" (próxima página) da SRP. Devolve o URL absoluto ou null (última página não tem Next).
export function extractNextUrl(html) {
  // O href do "Next" contém sempre "…for-sale" (geral `used-cars-for-sale` ou por marca
  // `used-bmw-for-sale`, `used-mercedes+benz-for-sale`, …). Casamos por "for-sale" + btn-warning.
  const m = /<a href="([^"]*for-sale[^"]*)"[^>]*class="[^"]*btn-warning[^"]*"[^>]*>\s*Next/i.exec(html);
  if (!m) return null;
  const href = m[1];
  return href.startsWith('http') ? href : BASE + href.replace(/^\/\//, '/');
}

// Parse completo de uma SRP → { listings, nextUrl }.
export function parseListingPage(html, { collectedAt = null } = {}) {
  const listings = extractCards(html).map((c) => normalizeCard(c, { collectedAt }));
  return { listings, nextUrl: extractNextUrl(html) };
}

// Chave de dedupe / estado: o id do registo (data-record, hash único e estável no Ooyyo).
export function recordId(rec) {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
