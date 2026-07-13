// autouncle/schema.mjs — schema-alvo comum + mapeamento de um carro do autouncle.pt.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Aqui juntamos os dois lados
// da mesma página SSR (molde theparking/agregador):
//   • JSON-LD (`ItemList.itemListElement[].item`, um `Product`+`Vehicle`) → campos-base "de catálogo":
//     make, model, ano, km, combustível, caixa, cilindrada, cor, portas, carroçaria, preço, país, URL.
//   • RSC (`self.__next_f`, mapa por carId, ver parse.mjs) → o que falta a um AGREGADOR: a FONTE de
//     origem (`sourceName` = o site/stand onde o anúncio vive), o rating de preço da AutoUncle
//     (`auRating`, o "AutoScore" 1–5), a imagem real, a variante e os dias em stock.
//
// AGREGADOR: `source` = site/stand de origem (ex. "PRCar", "Feiracar.pt", "Ar-automoveis.com"),
// `source_site` = 'autouncle.pt'. `country` = 'PORTUGAL'. `region`/`postalCode` = null (o JSON-LD só
// expõe `addressCountry: PT` por anúncio; a localização fina não vem nesta projeção). Ver
// research/autouncle-investigacao.md.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
import { MARKET } from './http.mjs';
export { CAMPOS, toInt, cleanStr };

// carId numérico a partir do @id / URL de detalhe: `…/pt/d/6551782-usado-…`.
export function idFromUrl(url) {
  const m = /\/pt\/d\/(\d+)-/.exec(url || '');
  return m ? m[1] : null;
}

// Remove o fragmento (#product/#offer) do URL de detalhe.
function cleanUrl(url) {
  if (!url) return null;
  const s = String(url).split('#')[0];
  return s || null;
}

// Preço formatado pela AutoUncle ("€ 19.351", "19 351 €") → inteiro EUR. Null se não houver dígitos.
function precoFormatado(s) {
  if (s == null) return null;
  const digits = String(s).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// Ano a partir de "2020"/"2020-01" (não usar toInt — colaria dígitos). Null se não houver 4 dígitos.
function anoDe(v) {
  const m = /(\d{4})/.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
}

// Placeholder de imagem do site (quando o anúncio não tem foto no JSON-LD).
const IMG_PLACEHOLDER = /placeholder\.png/i;

// --- mapeamento (item JSON-LD + extras RSC) -> registo normalizado ------------
//
// Mapa (referência rápida):
//   item.brand.name                              -> make
//   item.model                                   -> model
//   rsc.equipmentVariant (fallback nome)         -> variant
//   item.vehicleModelDate                        -> year
//   item.mileageFromOdometer.value               -> km
//   item.fuelType                                -> fuel     (Diesel/Gasolina/Elétrico…)
//   item.vehicleTransmission                     -> gearbox  (Automática/Manual)
//   item.vehicleEngine.engineDisplacement (L→cm³)-> engine   (cilindrada cm³, uniforme c/ autoboerse)
//   item.color                                   -> color
//   item.numberOfDoors                           -> doors
//   item.bodyType                                -> category (SUV/Hatchback/…)
//   item.offers.price                            -> price
//   item.offers.priceCurrency                    -> currency (EUR)
//   'PORTUGAL'                                    -> country
//   (só addressCountry PT no JSON-LD)            -> region/postalCode = null
//   rsc.sourceName                               -> source   (site/stand de origem — AGREGADOR)
//   item.@id (sem #fragment)                      -> detail_url
//   rsc.imageUrls[0] (fallback item.image)       -> image
// Extras: source_site, id (carId), price_rating (auRating 1–5, 5=ótimo preço), estimated_price
// (avaliação de preço-justo da AutoUncle), you_save, days_on_market (laytime), seller_type
// (particular/stand), source_slug + source_external_id (do link de saída), power_hp/power_kw, co2,
// fuel_consumption, model_generation, name.
export function normalizeCar(item, extra = {}, { collectedAt = null } = {}) {
  const detailUrl = cleanUrl(item['@id'] || item.offers?.url);
  const id = idFromUrl(detailUrl);
  const eng = item.vehicleEngine || {};
  const displ = eng.engineDisplacement;       // { value: 1.5, unitText: "L" }
  const power = eng.enginePower;               // { value: 115, unitText: "HP", additionalProperty: { value: 84 kW } }
  const powerHp = power && power.value != null ? Math.round(power.value) : null;
  const powerKw = power?.additionalProperty?.value != null ? Math.round(power.additionalProperty.value) : null;
  // cilindrada: JSON-LD dá litros → guardamos cm³ (uniforme com autoboerse/autohero).
  const engineCc = displ && displ.value != null
    ? (String(displ.unitText).toUpperCase() === 'L' ? Math.round(displ.value * 1000) : Math.round(displ.value))
    : null;
  // imagem: preferimos a real do RSC; o JSON-LD costuma trazer placeholder.
  const jsonImg = item.image?.url && !IMG_PLACEHOLDER.test(item.image.url) ? item.image.url : null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(item.brand?.name),
    model: cleanStr(item.model),
    variant: cleanStr(extra.variant) || null,
    year: anoDe(item.vehicleModelDate),
    km: toInt(item.mileageFromOdometer?.value),
    fuel: cleanStr(item.fuelType),
    gearbox: cleanStr(item.vehicleTransmission),
    engine: engineCc,
    color: cleanStr(item.color),
    doors: item.numberOfDoors != null ? toInt(item.numberOfDoors) : null,
    category: cleanStr(item.bodyType),
    price: item.offers?.price != null ? toInt(item.offers.price) : null,
    currency: cleanStr(item.offers?.priceCurrency) || MARKET.currency,
    country: MARKET.countryLabel,
    region: null,                                  // JSON-LD só expõe addressCountry PT por anúncio
    postalCode: null,
    source: cleanStr(extra.sourceName),            // site/stand de origem (AGREGADOR)
    detail_url: detailUrl,
    image: cleanStr(extra.image) || jsonImg,
    collected_at: collectedAt,

    // --- extras próprios do autouncle ---
    source_site: 'autouncle.pt',
    id: id != null ? String(id) : null,            // carId numérico (chave natural / dedupe)
    price_rating: extra.auRating != null ? extra.auRating : null,     // AutoScore 1–5 (5 = ótimo preço)
    estimated_price: precoFormatado(extra.estimatedPrice),            // avaliação de preço-justo AutoUncle
    you_save: extra.youSave != null ? extra.youSave : null,          // diferença estimada (EUR)
    days_on_market: extra.laytime != null ? extra.laytime : null,    // dias em stock (proxy de recência)
    seller_type: extra.isPrivate == null ? null : (extra.isPrivate ? 'particular' : 'stand'),
    source_slug: cleanStr(extra.sourceSlug),       // slug do site de origem no link de saída (prcar-pt)
    source_external_id: cleanStr(extra.sourceExternalId),            // id do anúncio no site de origem
    power_hp: powerHp,
    power_kw: powerKw,
    co2: item.emissionsCO2 != null ? `${Math.round(item.emissionsCO2)} g/km` : null,
    fuel_consumption: item.fuelConsumption?.value != null ? `${item.fuelConsumption.value} L/100km` : null,
    model_generation: cleanStr(extra.modelGeneration),
    name: cleanStr(item.name),                     // título completo (inclui variante/potência)
  };
}
