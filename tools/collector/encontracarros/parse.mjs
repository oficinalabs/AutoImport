// encontracarros/parse.mjs — extração dos dados de uma PÁGINA DE DETALHE do encontracarros.pt
// (`/anuncio/{slug}-{id6}`). É aqui que estão os dados (a listagem `/pesquisa` é client-side).
//
// PADRÃO-MOLDE: theparking (agregador; `source` = site de origem) + JSON-LD `Vehicle` (como autopt).
// Diferença: aqui há 1 anúncio por página (não 27/listagem) → 1 request por anúncio. Cada página traz
// DUAS fontes SSR, que combinamos:
//   (1) JSON-LD `schema.org/Vehicle` — fonte PRINCIPAL, JSON limpo e estável: marca, modelo, ano, km,
//       caixa, portas, categoria (bodyType), combustível, potência, imagens, preço, localidade, país.
//   (2) Objeto `carListing` no payload RSC do Next.js (`self.__next_f`) — dá o que é PRÓPRIO do
//       agregador: o SITE DE ORIGEM (`advertiser`: olx.pt / standvirtual.com / custojusto.pt / …), o
//       URL EXTERNO ORIGINAL (`url`), o nome do VENDEDOR/STAND (`dealership_name`), a cor, a condição
//       (USED/NEW) e se é nacional/importado (`source`: NATIONAL/IMPORTED).
// Confirmação redundante da origem: o HTML tem o marcador SSR "Anúncio original publicado em <site>".

import { normalizeListing } from './schema.mjs';
import { idFromUrl } from './sitemap.mjs';

// --- (1) JSON-LD Vehicle ---------------------------------------------------
// GOTCHA (como theparking/autopt): caracteres de controlo literais dentro das strings tornam o JSON
// inválido → sanitizamos antes de JSON.parse.
export function extractVehicle(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let j;
    try { j = JSON.parse(m[1].replace(/[\x00-\x1f]+/g, ' ')); } catch { continue; }
    if (j && (j['@type'] === 'Vehicle' || j['@type'] === 'Car')) return j;
  }
  return null;
}

// --- (2) payload RSC (flight) ---------------------------------------------
// Os dados do Next.js App Router vêm em vários `self.__next_f.push([1,"…escaped…"])`. Reconstruímos a
// string juntando os pedaços e des-escapando cada um com JSON.parse('"'+…+'"') (trata \" \\ \n \uXXXX).
// É seguro: dentro de cada push as aspas estão escapadas (`\"`), logo o único `"]` não-escapado é o
// terminador → a captura não-gananciosa não trunca a meio.
function reconstructFlight(html) {
  let out = '';
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { out += JSON.parse('"' + m[1] + '"'); } catch { /* pedaço malformado — ignora */ }
  }
  return out;
}

// Extrai o objeto `carListing` (o anúncio PRINCIPAL) do flight, por correspondência de chavetas.
// PORQUÊ brace-matching: há ~12 anúncios SEMELHANTES na mesma página (secção de comparação de preço),
// cada um com o seu `advertiser`/`dealership_name`. O `carListing` é o único que é ESTE anúncio →
// isolamo-lo pelo objeto e só depois lemos os campos (senão apanharíamos o advertiser de um semelhante).
function extractCarListing(flight) {
  const key = '"carListing":';
  const i = flight.indexOf(key);
  if (i < 0) return null;
  const start = i + key.length;
  if (flight[start] !== '{') return null;
  let depth = 0;
  for (let k = start; k < flight.length; k++) {
    const c = flight[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return flight.slice(start, k + 1); }
  }
  return null;
}

// Lê um campo string simples de um pedaço já des-escapado (`"key":"value"`).
function strField(sub, key) {
  const m = new RegExp('"' + key + '":"([^"]*)"').exec(sub || '');
  return m ? m[1] : null;
}

// Site de origem: preferimos o `advertiser` do carListing; fallback = marcador SSR no HTML.
function extractSourceSite(html, carListing) {
  const adv = strField(carListing, 'advertiser');
  if (adv) return adv;
  const m = /Anúncio original publicado em <!-- -->([a-z0-9.\-]+)/i.exec(html);
  return m ? m[1] : null;
}

// Parse completo de uma página de detalhe → objeto "raw" para o schema (ou null se não for anúncio).
// `sitemap` (opcional): a entrada do sitemap {lastmod, …} para anexar a data de atualização.
export function parseDetail(html, { collectedAt = null, sitemap = null } = {}) {
  const veh = extractVehicle(html);
  const flight = reconstructFlight(html);
  const carListing = extractCarListing(flight);
  if (!veh && !carListing) return null;              // página sem dados úteis

  const detailUrl = veh?.url || veh?.offers?.url || strField(carListing, 'slug') || null;
  const id = idFromUrl(detailUrl) || (sitemap && sitemap.id) || null;

  const raw = {
    id,
    detailUrl: detailUrl && detailUrl.startsWith('http') ? detailUrl
      : detailUrl ? `https://www.encontracarros.pt/anuncio/${detailUrl}` : null,
    veh,
    sourceSite: extractSourceSite(html, carListing),   // site de origem (olx.pt / standvirtual.com / …)
    sourceUrl: strField(carListing, 'url'),            // URL externo original (no site de origem)
    dealer: strField(carListing, 'dealership_name'),   // nome do vendedor/stand (null se não exposto)
    // cor: nem no carListing nem sempre no JSON-LD. A 1ª `"color"` do flight é a do carro principal
    // (os dados do anúncio vêm antes da secção de semelhantes no stream RSC) — verificado em amostra.
    color: strField(carListing, 'color') || (/"color":"([^"]{1,20})"/.exec(flight) || [])[1] || null,
    condition: strField(carListing, 'condition'),      // USED / NEW
    national: strField(carListing, 'source'),          // NATIONAL / IMPORTED
    title: strField(carListing, 'title'),              // título do anúncio (marca+modelo)
    lastmod: sitemap ? sitemap.lastmod : null,         // recência (do sitemap)
  };
  return normalizeListing(raw, { collectedAt });
}

// Chave de dedupe / estado: o id de 6 chars do anúncio.
export function recordId(rec) {
  return rec.id || rec.detail_url || null;
}
