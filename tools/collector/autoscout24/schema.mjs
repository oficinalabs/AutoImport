// autoscout24/schema.mjs — mapeia um objeto `listings[]` do __NEXT_DATA__ do AutoScout24
// para o registo normalizado comum (+ extras ricos que o AS24 oferece).
//
// PORQUÊ __NEXT_DATA__ e não JSON-LD: o AS24 (stack Scout24, igual ao autotrader.nl) embute no
// SSR um array `props.pageProps.listings[]` muito mais rico que o JSON-LD — preço, veículo,
// localização, vendedor, avaliação de preço, potência, CO2, consumos, imagens. A API interna
// (`/api/…`, GraphQL) é robots-disallowed e desnecessária. Ver research/autoscout24-investigacao.md.

import { toInt, cleanStr } from '../lib/normalize.mjs';

// countryCode ISO -> nome em maiúsculas (uniforme com o theparking/autotrader).
const PAIS = {
  DE: 'GERMANY', AT: 'AUSTRIA', A: 'AUSTRIA', BE: 'BELGIUM', B: 'BELGIUM',
  ES: 'SPAIN', E: 'SPAIN', FR: 'FRANCE', F: 'FRANCE', IT: 'ITALY', I: 'ITALY',
  LU: 'LUXEMBOURG', L: 'LUXEMBOURG', NL: 'NETHERLANDS',
};

// Lê um valor de `vehicleDetails[]` pelo iconName (ex. 'calendar', 'speedometer', 'leaf').
function detalhe(vd, iconName) {
  const d = (vd || []).find((x) => x?.iconName === iconName);
  return d?.data ?? null;
}

export function normalizeListing(L, { collectedAt = null } = {}) {
  const v = L.vehicle || {};
  const loc = L.location || {};
  const seller = L.seller || {};
  const price = L.price || {};
  const vd = L.vehicleDetails || [];

  // Ano: da 1ª registo "MM/AAAA" (icon 'calendar'), fallback tracking.firstRegistration "MM-AAAA".
  const regData = detalhe(vd, 'calendar') || L.tracking?.firstRegistration || null;
  const anoMatch = /(\d{4})/.exec(String(regData || ''));
  // Potência: "160 kW (218 PS)" -> 160 (kW).
  const powMatch = /(\d+)\s*kW/i.exec(detalhe(vd, 'speedometer') || '');
  // CO2: "130 g/km (komb.)" (icon 'leaf' ou wltpValues).
  const co2 = detalhe(vd, 'leaf') || (L.wltpValues || []).map(String).find((x) => /g\/km/i.test(x)) || null;
  // Consumo combinado: "4,9 l/100 km (komb.)" (icon 'water_drop').
  const consumo = detalhe(vd, 'water_drop') || (L.wltpValues || []).map(String).find((x) => /l\/100/i.test(x)) || null;

  // Vendedor: nome do stand; se for particular, marca "Particular" (uniforme com os coletores PT).
  const isPrivate = /private/i.test(seller.type || '');
  const source = isPrivate ? 'Particular' : cleanStr(seller.companyName);

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(v.make),
    model: cleanStr(v.modelGroup || v.model),
    variant: cleanStr(v.motorTypeName || v.modelVersionInput || v.model),
    year: anoMatch ? Number(anoMatch[1]) : null,
    km: toInt(v.mileageInKm ?? detalhe(vd, 'mileage_odometer')),   // "199.000 km" -> 199000
    fuel: cleanStr(v.fuel),
    gearbox: cleanStr(v.transmission),
    engine: cleanStr(v.engineDisplacementInCCM),                   // "1.995 cm³"
    color: null,                       // não exposto ao nível da listagem (vem com --detail)
    doors: null,                       // idem
    category: cleanStr(v.variant),     // no AS24 `variant` é a carroçaria (Limousine, SUV, Kombi…)
    price: toInt(price.priceRaw),
    currency: 'EUR',
    country: PAIS[loc.countryCode] || cleanStr(loc.countryCode),
    region: null,                      // só há cidade
    postalCode: cleanStr(loc.zip),
    source,                            // origem concreta = o stand/dealer (ou "Particular")
    detail_url: L.url ? new URL(L.url, 'https://www.autoscout24.de').href : null,
    image: cleanStr(Array.isArray(L.images) ? L.images[0] : L.images),
    collected_at: collectedAt,

    // --- extras próprios do AutoScout24 ---
    source_site: 'autoscout24.de',
    id: cleanStr(L.id || L.identifier?.crossReferenceId || L.crossReferenceId),
    city: cleanStr(loc.city),
    street: cleanStr(loc.street),
    power_kw: powMatch ? Number(powMatch[1]) : null,
    co2: cleanStr(co2),
    fuel_consumption: cleanStr(consumo),
    first_registration: cleanStr(regData),               // "MM/AAAA"
    seller_type: cleanStr(seller.type),                  // Dealer / Private
    seller_id: cleanStr(seller.id),
    // price_evaluation: avaliação de MERCADO do próprio AS24 (1=muito bom … 5=alto, 99=s/ dados)
    // — ouro para comparação de preço PT vs. UE.
    price_evaluation: Number.isInteger(price.priceEvaluation) ? price.priceEvaluation : null,
    offer_type: cleanStr(v.offerType),                   // U=usado, N=novo, J=jahreswagen, O=oldtimer…
    is_damaged: v.isCurrentlyDamaged === true ? true : (v.isCurrentlyDamaged === false ? false : null),
    super_deal: L.superDeal?.isEligible === true ? true : null,
    vat_label: price.isVatLabelLegallyRequired === true ? true : null,
    model_id: v.modelId != null ? Number(v.modelId) : null,
    image_count: Array.isArray(L.images) ? L.images.length : null,
    availability: cleanStr(L.availability?.fromDate) || (L.availableNow ? 'now' : null),
  };
}
