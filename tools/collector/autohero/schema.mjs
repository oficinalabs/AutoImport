// autohero/schema.mjs — schema-alvo comum + mapeamento de um anúncio da API do autohero.com.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// anúncio de `searchAdV9AdsV2.data[]` no registo comum, estendido com os extras ricos que a API
// oferece de graça (potência, CO2, nº de donos/acidentes/danos, histórico de preço, sucursal…).
//
// NOTA sobre o Autohero: é um RETALHISTA de STOCK PRÓPRIO (grupo AUTO1), não um agregador de stands
// nem um portal de particulares. Logo `source` = 'Autohero' para todos. Entrega a nível nacional a
// partir de sucursais/oficinas centrais → tratamos como aramisauto: region/postalCode = null (a
// sucursal de recolha fica guardada como extra `branch_*`). doors/color/category não vêm nesta
// projeção da listagem → null. Ver research/autohero-investigacao.md.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
import { BASE, MARKET } from './http.mjs';
export { CAMPOS, toInt, cleanStr };

// Códigos numéricos da API → rótulos (extraídos do bundle da app; ver investigação).
const FUEL_MAP = {
  1039: 'Benzin', 1040: 'Diesel', 1041: 'Gas', 1042: 'Erdgas', 1043: 'Sonstige',
  1044: 'Elektro', 1045: 'Ethanol', 1046: 'Hybrid', 1047: 'Wasserstoff',
};
const GEAR_MAP = { 1138: 'Manuell', 1139: 'Automatik', 1140: 'Halbautomatik', 1141: 'Doppelkupplung' };

// Preço em unidades maiores (EUR) a partir de `{ amountMinorUnits, conversionMajor }` (cêntimos).
function toMajor(money) {
  if (!money || money.amountMinorUnits == null) return null;
  const div = money.conversionMajor || 100;
  return Math.round(money.amountMinorUnits / div);
}

// Data "YYYYMMDDT…"/"YYYY-MM-…" → "YYYY-MM-DD" (as datas da API vêm como "20170724T000000.000Z").
function toDate(d) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(d ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Ano a partir de "YYYY…" (não usar toInt — colaria os dígitos todos). Null se não houver 4 dígitos.
function anoDe(d) {
  const m = /^(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
}

// URL de detalhe: padrão SEO `/{locale}/{carUrlTitle}/id/{id}/` (bate 1:1 com o sitemap_search).
function detailUrl(a) {
  if (!a.carUrlTitle || !a.id) return null;
  return `${BASE}${MARKET.pathPrefix}/${a.carUrlTitle}/id/${a.id}/`;
}

// Imagem: `mainImageUrl` traz um placeholder `{size}` — substituído por '' devolve a original (200).
function imageUrl(a) {
  const u = a.mainImageUrl || a.ahMainImageUrl;
  return u ? String(u).replace('{size}', '') : null;
}

// --- mapeamento anúncio da API -> registo normalizado ------------------------
//
// Mapa (referência rápida):
//   manufacturer                             -> make
//   model                                    -> model
//   subType + subTypeExtra                   -> variant  (ex. "C 400 T 4Matic AMG Line")
//   firstRegistrationYear                    -> year
//   mileage.distance                         -> km
//   fuelType (código)                        -> fuel     (Benzin/Diesel/Elektro/Hybrid…)
//   gearType (código)                        -> gearbox  (Manuell/Automatik…)
//   ccm                                      -> engine   (cilindrada cm³)
//   (não exposto na listagem)                -> color/doors/category = null
//   offerPrice (minorUnits/100)              -> price
//   MARKET.currency                          -> currency (EUR)
//   MARKET.countryLabel                      -> country  (GERMANY)
//   (retalhista nacional; sucursal em extras)-> region/postalCode = null
//   'Autohero'                                -> source   (stock próprio)
//   (reconstruído)                           -> detail_url
//   mainImageUrl (sem {size})                -> image
// Extras: source_site, id (UUID), stock_number, retail_ad_id, power_kw, power_ps, drive_train,
// co2, fuel_consumption_combined, built_year, first_registration, preowner_count, accidents,
// damages, has_service_book, emission_sticker, monthly_payment, price_previous, price_first,
// branch_city/zip/name, listing_first_published_at (recência), listing_published_at,
// is_coming_soon, retail_ad_state.
export function normalizeAd(a, { collectedAt = null } = {}) {
  const kw = a.kw != null ? Math.round(a.kw) : null;
  const variant = [a.subType, a.subTypeExtra].map(cleanStr).filter(Boolean).join(' ') || null;
  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(a.manufacturer),
    model: cleanStr(a.model),
    variant,
    year: a.firstRegistrationYear || anoDe(a.registration) || a.builtYear || null,
    km: toInt(a.mileage?.distance),
    fuel: FUEL_MAP[a.fuelType] || (a.fuelType != null ? String(a.fuelType) : null),
    gearbox: GEAR_MAP[a.gearType] || (a.gearType != null ? String(a.gearType) : null),
    engine: a.ccm != null ? Math.round(a.ccm) : null,   // cilindrada cm³ (como o autoboerse)
    color: null,                                         // não exposto nesta projeção
    doors: null,                                         // não exposto nesta projeção
    category: null,                                      // carroçaria não vem por anúncio
    price: toMajor(a.offerPrice),
    currency: cleanStr(a.offerPrice?.currency) || MARKET.currency,
    country: MARKET.countryLabel,
    region: null,                                        // retalhista nacional — sem local por anúncio
    postalCode: null,
    source: 'Autohero',                                  // stock próprio (não é agregador de stands)
    detail_url: detailUrl(a),
    image: imageUrl(a),
    collected_at: collectedAt,

    // --- extras próprios do autohero ---
    source_site: 'autohero.com',
    id: cleanStr(a.id),                                  // UUID estável (chave natural)
    stock_number: cleanStr(a.stockNumber),
    retail_ad_id: cleanStr(a.retailAdId),
    power_kw: kw,
    power_ps: kw != null ? Math.round(kw * 1.35962) : null,
    drive_train: cleanStr(a.driveTrain),                 // front-wheel / back-wheel / all-wheel-drive
    co2: a.co2Value != null ? `${Math.round(a.co2Value)} g/km` : null,
    fuel_consumption_combined: a.fuelConsumption?.combined ?? null,
    built_year: a.builtYear ?? null,
    first_registration: toDate(a.registration),          // "YYYY-MM-DD"
    preowner_count: a.carPreownerCount ?? null,
    accidents: a.numberOfAccidents ?? null,
    damages: a.numberOfDamages ?? null,
    has_service_book: typeof a.hasFilledServiceBook === 'boolean' ? a.hasFilledServiceBook : null,
    emission_sticker: cleanStr(a.emissionSticker),
    monthly_payment: toMajor(a.monthlyPayment),          // mensalidade indicativa (financiamento)
    price_previous: toMajor(a.previousPrice),            // histórico de preço (quando presente)
    price_first: toMajor(a.firstPrice),
    branch_city: cleanStr(a.esBranch?.city),
    branch_zip: cleanStr(a.esBranch?.zipcode),
    branch_name: cleanStr(a.esBranch?.name),
    listing_first_published_at: cleanStr(a.firstPublishedAt),  // recência REAL (1ª publicação)
    listing_published_at: cleanStr(a.publishedAt),
    is_coming_soon: typeof a.isComingSoon === 'boolean' ? a.isComingSoon : null,
    retail_ad_state: cleanStr(a.retailAdState),
  };
}
