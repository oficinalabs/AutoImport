// aramisauto/schema.mjs — schema-alvo comum + mapeamento do veículo Nuxt do aramisauto.com.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// veículo de `displayedSearchVehicleResponse.vehicles` no registo comum, estendido com os extras
// ricos que o aramisauto oferece de graça (potência, desconto, mensalidade, promoções…).
//
// NOTA sobre o aramisauto: é um RETALHISTA (stock próprio reconstruído), não um agregador de
// stands. Logo `source` = 'Aramisauto' para todos, e NÃO há dealer/região/CP por anúncio (o carro é
// entregue a nível nacional) → region/postalCode/doors = null. `offerType` distingue 0km vs.
// ocasião vs. neuf (guardado como extra).

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
import { BASE } from './http.mjs';
export { CAMPOS, toInt, cleanStr };

// Ano a partir de `firstCirculationDate` ("2025-06-30" → 2025). NÃO usar toInt (colaria os dígitos
// da data toda). Devolve null se não houver 4 dígitos iniciais.
function anoDaData(d) {
  const m = /^(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
}

// Reconstrói o URL de detalhe a partir das partes do veículo. Verificado: bate 1:1 com os URLs do
// JSON-LD da própria página (ex. /voitures/peugeot/2008/active/rv974409/?vehicleId=974409).
function detailUrl(v) {
  if (!v.makerId || !v.modelId || !v.offerId || v.vehicleId == null) return null;
  const finish = v.finishId ? `${v.finishId}/` : '';
  return `${BASE}/voitures/${v.makerId}/${v.modelId}/${finish}${v.offerId}/?vehicleId=${v.vehicleId}`;
}

// --- mapeamento veículo Nuxt -> registo normalizado --------------------------
//
// Mapa (documentado para referência rápida):
//   maker                                   -> make
//   model                                   -> model
//   finish                                  -> variant (acabamento/versão)
//   firstCirculationDate (YYYY-…)           -> year
//   mileage.km                              -> km
//   energyType.label (FR)                   -> fuel      (Essence/Diesel/Électrique/Hybride…)
//   transmission.label (FR)                 -> gearbox   (Manuelle/Automatique)
//   engine                                  -> engine    ("50 kWh - 136ch", "SHS-P"…)
//   simpleColors[0].label                   -> color
//   (não exposto por anúncio na listagem)   -> doors = null
//   category.label                          -> category  (carroçaria; "4x4 et SUV"…)
//   sellingPriceWithTaxes                   -> price
//   'EUR'                                    -> currency
//   'FRANCE'                                 -> country
//   (retalhista nacional, sem local)        -> region/postalCode = null
//   'Aramisauto'                             -> source    (stock próprio)
//   (reconstruído)                          -> detail_url
//   photo.url                               -> image
// Extras próprios: source_site, id (=vehicleId), offer_id, offer_type, status, power_ch, power_kw,
// tax_horsepower, energy_id, category_id, battery_autonomy_wltp, catalog_price, discount_amount,
// discount_percent, monthly_loan, promotions[].
export function normalizeVehicle(v, { collectedAt = null } = {}) {
  return {
    make: cleanStr(v.maker),
    model: cleanStr(v.model),
    variant: cleanStr(v.finish),
    year: anoDaData(v.firstCirculationDate),
    km: toInt(v.mileage?.km),
    fuel: cleanStr(v.energyType?.label),
    gearbox: cleanStr(v.transmission?.label),
    engine: cleanStr(v.engine),
    color: cleanStr(v.simpleColors?.[0]?.label),
    doors: null,                                     // não exposto por anúncio na listagem
    category: cleanStr(v.category?.label),
    price: toInt(v.sellingPriceWithTaxes),
    currency: 'EUR',
    country: 'FRANCE',
    region: null,                                    // retalhista nacional — sem local por anúncio
    postalCode: null,
    source: 'Aramisauto',                            // stock próprio (não é agregador de stands)
    detail_url: detailUrl(v),
    image: cleanStr(v.photo?.url),
    collected_at: collectedAt,
    // --- extras próprios do aramisauto ---
    source_site: 'aramisauto.com',
    id: v.vehicleId != null ? String(v.vehicleId) : null,
    offer_id: cleanStr(v.offerId),
    offer_type: cleanStr(v.offerType?.label),        // "Voiture 0km" / "Voiture d'occasion" / neuf
    status: cleanStr(v.status?.label),
    power_ch: toInt(v.power?.ch),
    power_kw: toInt(v.power?.kw),
    tax_horsepower: toInt(v.taxHorsepower),
    energy_id: cleanStr(v.energyType?.id),
    category_id: cleanStr(v.category?.id),
    battery_autonomy_wltp: toInt(v.batteryAutonomyWltp),
    catalog_price: toInt(v.catalogPriceWithOptionsWithTaxes),
    discount_amount: toInt(v.discount?.amount),
    discount_percent: v.discount?.percent ?? null,
    monthly_loan: toInt(v.indicativeLoan?.monthlyInstallment),
    promotions: Array.isArray(v.promotions) ? v.promotions.map((p) => cleanStr(p.label)).filter(Boolean) : [],
  };
}
