// meinauto/schema.mjs — schema-alvo comum + mapeamento do veículo Nuxt do meinauto.de.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// objeto de `pinia.results.results[]` (ver parse.mjs) no registo comum, estendido com os extras
// ricos que o meinauto oferece de graça (potência, CO2, dono anterior, acidentes, TÜV/uso…).
//
// NOTA sobre o meinauto.de: agrega STANDS/dealers (marketplace, origem "MARA"). Filtramos SEMPRE
// por `conditionCategories=PRE_OWNED` (Gebrauchtwagen) para NÃO apanhar carros novos/configuráveis
// (o site mistura Neuwagen/Leasing com usados). Cada anúncio traz preço de compra (`purchasePrice`),
// km e 1ª-matrícula reais, mais o stand vendedor (`seller`) e a sua localização (Bundesland + CP).
//
// PREÇO: `calculation.purchasePrice` é o preço de venda à vista (float, ex. 19770.01). NÃO usar
// toInt (colaria "1977001"); arredondamos com Math.round.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
import { BASE } from './http.mjs';
export { CAMPOS, toInt, cleanStr };

// CDN de imagens: os anúncios trazem `images[].path` (ex. "marketplace/stock/mara/9/c/4/1/<hash>");
// a URL pública é o CDN + esse path (imagem original; verificado 200). O site serve variantes
// `_w-400_q-60.webp` etc., mas o path base devolve o original — guardamos esse.
const CDN = 'https://assets-meinauto.de/';

// Ano a partir de `initialRegistration` ISO ("2022-02-01T…" → 2022). NÃO usar toInt (colaria os
// dígitos da data toda). Devolve null se não houver 4 dígitos iniciais.
function anoDaData(d) {
  const m = /^(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
}

// 1ª-matrícula "MM/AAAA" a partir da data ISO. Devolve null se não parsear.
function primeiraMatricula(d) {
  const m = /^(\d{4})-(\d{2})/.exec(String(d ?? ''));
  return m ? `${m[2]}/${m[1]}` : null;
}

// Preço à vista, arredondado ao inteiro (o campo é float). Devolve null se ausente/zero.
function preco(v) {
  const p = v?.calculation?.purchasePrice;
  return typeof p === 'number' && p > 0 ? Math.round(p) : null;
}

// --- mapeamento veículo Nuxt -> registo normalizado --------------------------
//
// Mapa (documentado para referência rápida):
//   make.name                                -> make
//   model.name                               -> model
//   vehicle.trim.name                        -> variant (acabamento, ex. "1.5 eTSI 110 kW")
//   vehicle.initialRegistration (ISO)        -> year
//   vehicle.mileage                          -> km        (pode ser 0 em pré-matrículas — válido)
//   vehicle.metaFuelType                     -> fuel      (PETROL/DIESEL/ELECTRIC/PLUGIN_HYBRID/LPG)
//   vehicle.transmissionType                 -> gearbox   (AUTOMATIC/MANUAL)
//   vehicle.ccm                              -> engine    (cilindrada cm³)
//   color.carPaint (fallback color.base)     -> color     ("Fjord-Blau" / "BLUE")
//   vehicle.doors                            -> doors
//   model.bodyType                           -> category  (SUV/LIMOUSINE/ESTATE_CAR/…)
//   calculation.purchasePrice (arredondado)  -> price
//   'EUR'                                    -> currency
//   'GERMANY'                                -> country
//   addresses.vehicle.region                 -> region    (Bundesland)
//   addresses.vehicle.zipcode                -> postalCode
//   seller.name                              -> source    (o stand vendedor)
//   /fahrzeugsuche/detail/{id}               -> detail_url
//   CDN + images[0].path                     -> image
// Extras próprios: source_site, id, seller_slug, city, power_kw, co2, previous_owner, accidents,
// first_registration ("MM/AAAA"), usage_type (PRE_REGISTRATION/DEMONSTRATION/EMPLOYEES_CAR),
// condition_category, emission_class, total_list_price, images (contagem), listing_created_at
// (recência REAL — usada no watch).
export function normalizeVehicle(r, { collectedAt = null } = {}) {
  const v = r.vehicle || {};
  const vehAddr = r.addresses?.vehicle || r.addresses?.seller || {};
  const img0 = Array.isArray(r.images) ? r.images[0] : null;
  const co2 = v.co2Emission != null ? `${v.co2Emission} g/km` : null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(r.make?.name),
    model: cleanStr(r.model?.name),
    variant: cleanStr(v.trim?.name),
    year: anoDaData(v.initialRegistration),
    km: toInt(v.mileage),
    fuel: cleanStr(v.metaFuelType),
    gearbox: cleanStr(v.transmissionType),
    engine: toInt(v.ccm),
    color: cleanStr(r.color?.carPaint || r.color?.base),
    doors: toInt(v.doors),
    category: cleanStr(r.model?.bodyType),
    price: preco(r),
    currency: 'EUR',
    country: 'GERMANY',
    region: cleanStr(vehAddr.region),
    postalCode: cleanStr(vehAddr.zipcode),
    source: cleanStr(r.seller?.name),            // origem concreta = o stand/dealer
    detail_url: r.id ? `${BASE}/fahrzeugsuche/detail/${r.id}` : null,
    image: img0?.path ? CDN + img0.path : null,
    collected_at: collectedAt,

    // --- extras próprios do meinauto ---
    source_site: 'meinauto.de',
    id: cleanStr(r.id),
    seller_slug: cleanStr(r.seller?.slug),
    city: cleanStr(vehAddr.city),
    power_kw: toInt(v.power?.kw),
    co2: cleanStr(co2),                          // WLTP combinado, "g/km"
    previous_owner: v.previousOwner ?? null,
    accidents: typeof v.accidentDamaged === 'boolean' ? v.accidentDamaged : null,
    first_registration: primeiraMatricula(v.initialRegistration),   // "MM/AAAA"
    usage_type: cleanStr(v.usageType),           // PRE_REGISTRATION / DEMONSTRATION / EMPLOYEES_CAR
    condition_category: cleanStr(v.conditionCategory),               // sempre PRE_OWNED (guarda)
    emission_class: cleanStr(v.emissionClass),
    total_list_price: typeof v.totalListPrice === 'number' ? Math.round(v.totalListPrice) : null,
    images: Array.isArray(r.images) ? r.images.length : null,
    listing_created_at: cleanStr(r.createdAt),   // recência REAL (sort por data existe → ver watch)
  };
}
