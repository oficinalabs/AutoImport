// ooyyo/schema.mjs — schema-alvo comum + mapeamento do card HTML do Ooyyo (secção BE).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// card `<a class="car-card-1">` (já extraído em parse.mjs) no registo comum, estendido com os
// extras que o Ooyyo oferece de graça.
//
// AGREGADOR (como o theparking): o Ooyyo não é a origem do anúncio — indexa sites terceiros. O
// `source` = SITE DE ORIGEM do anúncio (ex. autolive.be, autoscout24.be…), extraído do host do
// URL da imagem (o Ooyyo serve as fotos via proxy `images.ooyyo.com/media/…?url=<host-origem>/…`).
// `source_site` = 'ooyyo.com' (o agregador onde recolhemos).

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
export { CAMPOS, toInt, cleanStr };

// --- mapeamento card Ooyyo -> registo normalizado ---------------------------
//
// Mapa (documentado para referência rápida; os campos vêm já extraídos por parse.mjs):
//   heading[1]              -> make        (ex. "Land Rover")
//   heading[2]              -> model       (ex. "Defender")
//   heading[3] (+título)    -> variant     (ex. "2.4"; senão o `title` do anúncio)
//   heading[0]              -> year        (ex. "2007")
//   .mileage "55,762 km"    -> km
//   description (vocab)     -> fuel        (ex. "Diesel"; pode faltar)
//   (não exposto na listagem)-> gearbox = null
//   heading[3]              -> engine      (cilindrada textual, ex. "2.4"; pode faltar)
//   description (vocab)     -> color       (ex. "Black"; pode faltar), doors = null
//   description (vocab)     -> category    (carroçaria, ex. "Suv", "Hatchback")
//   data-price / idCurrency -> price / currency (currency 3 => EUR)
//   'BELGIUM'               -> country     (secção BE; confirmado pelo país do card)
//   .mob-location (cidade)  -> region      (cidade/localidade; pode faltar)
//   (não exposto)           -> postalCode = null
//   host de origem da imagem-> source      (site de origem do anúncio — é agregador)
//   href (detalhe Ooyyo)    -> detail_url  (absoluto: página do registo no Ooyyo)
//   data-src (proxy)        -> image
// Extras próprios: source_site='ooyyo.com', id (=data-record, hash único → dedupe), source_host
// (host completo da imagem), deal (rótulo, ex. "Super price"), save_percent (%), image_count.
//
// `card` é o objeto de campos já parseado; `collectedAt` é injetado por quem chama.
export function normalizeCard(card, { collectedAt = null } = {}) {
  const cur = card.currencyId === '3' ? 'EUR' : (card.currency || 'EUR');
  return {
    make: cleanStr(card.make),
    model: cleanStr(card.model),
    variant: cleanStr(card.variant || card.title),
    year: toInt(card.year),
    km: toInt(card.km),
    fuel: cleanStr(card.fuel),
    gearbox: null,                                   // não exposto na listagem
    engine: cleanStr(card.engine),
    color: cleanStr(card.color),                     // por vezes exposto na descrição (pode faltar)
    doors: null,                                     // não exposto na listagem
    category: cleanStr(card.category),
    price: toInt(card.price),
    currency: cur,
    country: 'BELGIUM',
    region: cleanStr(card.city),                     // cidade/localidade (pode faltar)
    postalCode: null,                                // não exposto na listagem
    source: cleanStr(card.source),                   // site de origem do anúncio (agregador)
    detail_url: cleanStr(card.detailUrl),
    image: cleanStr(card.image),
    collected_at: collectedAt,
    // --- extras próprios do Ooyyo ---
    source_site: 'ooyyo.com',
    id: cleanStr(card.id),
    source_host: cleanStr(card.sourceHost),
    deal: cleanStr(card.deal),
    save_percent: card.savePercent ?? null,
    image_count: card.imageCount ?? null,
  };
}
