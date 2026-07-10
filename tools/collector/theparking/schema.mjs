// schema.mjs — schema-alvo de normalização + mapeamento do JSON-LD do theparking.eu.
//
// PORQUÊ: todos os coletores da AutoImport devem produzir o MESMO registo normalizado,
// para depois comparar preços PT vs. estrangeiro de forma uniforme. Este módulo define
// esse schema e a função que converte um bloco JSON-LD `schema.org/Vehicle` (mais a
// fonte extraída do card) num registo desse schema.
//
// O schema-alvo base está declarado em research/scraping-estado.md; aqui é estendido
// com os campos extra que o JSON-LD do theparking.eu oferece de graça (engine, color,
// doors, category, region, postalCode, image).

// Campos do registo normalizado (ordem canónica, útil para exportar CSV mais tarde).
export const CAMPOS = [
  'make', 'model', 'variant', 'year', 'km', 'fuel', 'gearbox', 'engine',
  'color', 'doors', 'category', 'price', 'currency', 'country', 'region',
  'postalCode', 'source', 'detail_url', 'image', 'collected_at',
];

// --- normalizadores ------------------------------------------------------

// toInt: extrai o inteiro de uma string com ruído ("121985", " 121 985 km", "5 Doors").
// Devolve null se não houver dígitos — preferimos null a 0 para não falsear estatísticas.
export function toInt(v) {
  if (v == null) return null;
  const digits = String(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// cleanStr: trim + colapso de espaços/quebras internas. Devolve null se ficar vazio.
// Necessário porque os valores do theparking.eu vêm com espaços e newlines dispersos.
export function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}

// --- mapeamento JSON-LD Vehicle -> registo normalizado -------------------
//
// Mapa (documentado para referência rápida):
//   brand                                  -> make
//   model                                  -> model
//   name                                   -> variant (título completo)
//   productionDate | dateVehicleFirstReg.  -> year
//   mileageFromOdometer.value              -> km
//   fuelType                               -> fuel
//   vehicleTransmission                    -> gearbox
//   vehicleEngine.name                     -> engine
//   color                                  -> color
//   numberOfDoors                          -> doors
//   description  (regex "Category XXX")    -> category
//   offers.price / offers.priceCurrency    -> price / currency
//   offers.url                             -> detail_url
//   offers.availableAtOrFrom.address.*     -> country / region / postalCode
//   image                                  -> image
//   (extraído do card, não do JSON-LD)     -> source
//
// `source` e `collected_at` são injetados por quem chama (não existem no JSON-LD).
export function normalizeVehicle(v, { source = null, collectedAt = null } = {}) {
  const offer = v.offers || {};
  const addr = offer.availableAtOrFrom?.address || {};
  // A categoria (WAGON, SUV, ...) só existe dentro do texto livre de `description`.
  const category = (() => {
    const m = /Category\s+([A-Za-zÀ-ú0-9 /-]{2,25})/i.exec(v.description || '');
    return m ? cleanStr(m[1]) : null;
  })();

  return {
    make: cleanStr(v.brand?.name || v.brand) || cleanStr((v.name || '').split(/\s+/)[0]),
    model: cleanStr(v.model),
    variant: cleanStr(v.name),
    year: toInt(v.productionDate || v.dateVehicleFirstRegistered || v.modelDate),
    km: toInt(v.mileageFromOdometer?.value ?? v.mileageFromOdometer),
    fuel: cleanStr(v.fuelType),
    gearbox: cleanStr(v.vehicleTransmission),
    engine: cleanStr(v.vehicleEngine?.name),
    color: cleanStr(v.color),
    doors: toInt(v.numberOfDoors),
    category,
    price: toInt(offer.price),
    currency: cleanStr(offer.priceCurrency) || 'EUR',
    country: cleanStr(addr.addressCountry?.name || addr.addressCountry),
    region: cleanStr(addr.addressRegion),
    postalCode: cleanStr(addr.postalCode),
    source,
    detail_url: cleanStr(offer.url),
    image: cleanStr(Array.isArray(v.image) ? v.image[0] : v.image),
    collected_at: collectedAt,
  };
}
