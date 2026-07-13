// ocasionplus/schema.mjs — schema-alvo comum + mapeamento do JSON-LD do ocasionplus.com.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// `Vehicle` (item do `ItemList` JSON-LD) — mais os extras do card HTML (região/centro e preços de
// referência/financiado) — no registo comum, estendido com os extras que o OcasionPlus dá de graça.
//
// Mapa (documentado para referência rápida):
//   brand.name                              -> make            (ex. "Skoda")
//   name  (menos a marca)                   -> model           (ex. "Karoq")
//   model  (título completo)                -> variant         (ex. "Skoda Karoq 2.0 TDI Selection (115 CV)")
//   productionDate (slice do ano)           -> year            (ex. 2024)
//   mileageFromOdometer.value               -> km              (ex. 30888)
//   fuelType                                -> fuel            (ex. "Diésel")
//   vehicleTransmission                     -> gearbox         (ex. "MANUAL")
//   (sem cilindrada; só potência)           -> engine = null
//   (não exposto na listagem)               -> color = null
//   (não exposto na listagem)               -> doors = null
//   (não exposto na listagem)               -> category = null
//   offers.price / offers.priceCurrency     -> price / currency  (preço AL CONTADO, canónico)
//   'SPAIN'                                  -> country
//   (card, província do centro)             -> region          ← não existe no JSON-LD
//   (não exposto na listagem)               -> postalCode = null
//   'OcasionPlus'                           -> source          (retalhista único; o centro vai em `center`)
//   offers.url                              -> detail_url
//   image                                   -> image
// Extras próprios: source_site, id (token do slug), slug, center (card), power_hp ("(115 CV)"),
// price_reference (card span-price, PVP riscado), price_finance (card span-finance, financiado),
// monthly (card, cuota/mes), condition (offers.itemCondition).
//
// GOTCHA do preço: o OcasionPlus mostra TRÊS números — PVP de referência (riscado, `price_reference`),
// preço financiado (`price_finance`, o destaque grande) e o preço AL CONTADO. Confirmámos na página
// de detalhe que o preço canónico (o que domina o detalhe) é o `offers.price` do JSON-LD (contado);
// usamo-lo como `price` e guardamos os outros dois como extras.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
export { CAMPOS, toInt, cleanStr };

// Ano a partir do `productionDate` ISO ("2024-04-03T00:00:00.000Z"). NÃO usar toInt (colava todos
// os dígitos da data). Extraímos os 4 primeiros dígitos e validamos o intervalo plausível.
function yearFrom(v) {
  const m = /(\d{4})/.exec(String(v ?? ''));
  const y = m ? Number(m[1]) : null;
  return y && y >= 1950 && y <= 2100 ? y : null;
}

// Potência (CV) embutida no título "(115 CV)" — o JSON-LD não a expõe em campo próprio.
function powerFrom(...strs) {
  for (const s of strs) {
    const m = /\((\d{2,4})\s*CV\)/i.exec(String(s ?? ''));
    if (m) return Number(m[1]);
  }
  return null;
}

// `extras` (do card) e `collectedAt` são injetados por quem chama.
export function normalizeVehicle(v, { extras = {}, collectedAt = null } = {}) {
  const offer = v.offers || {};
  const make = cleanStr(v.brand?.name || v.brand);
  // model curto = `name` ("Skoda Karoq") sem a marca → "Karoq". Se falhar, fica o `name` completo.
  let model = cleanStr(v.name);
  if (make && model) {
    const semMarca = model.replace(new RegExp(`^${make}\\s+`, 'i'), '').trim();
    if (semMarca) model = semMarca;
  }
  const img = Array.isArray(v.image) ? v.image[0] : v.image;
  const url = offer.url || null;
  const slug = url ? new URL(url).pathname.replace('/coches-segunda-mano/', '') : null;

  return {
    make,
    model,
    variant: cleanStr(v.model || v.name),           // título completo com versão + CV
    year: yearFrom(v.productionDate),
    km: toInt(v.mileageFromOdometer?.value ?? v.mileageFromOdometer),
    fuel: cleanStr(v.fuelType),
    gearbox: cleanStr(v.vehicleTransmission),
    engine: null,                                    // sem cilindrada no JSON-LD (só potência)
    color: null,                                     // não exposto na listagem
    doors: null,                                     // não exposto na listagem
    category: null,                                  // não exposto na listagem (Vehicle sem bodyType)
    price: toInt(offer.price),                       // preço al contado (canónico)
    currency: cleanStr(offer.priceCurrency) || 'EUR',
    country: 'SPAIN',
    region: cleanStr(extras.region),                 // província do centro (vem do card)
    postalCode: null,                                // não exposto na listagem
    source: 'OcasionPlus',                           // retalhista único; centro físico vai em `center`
    detail_url: cleanStr(url),
    image: cleanStr(img),
    collected_at: collectedAt,
    // --- extras próprios do ocasionplus ---
    source_site: 'ocasionplus.com',
    id: extras.id ?? (slug ? tokenFromSlug(slug) : null),
    slug: cleanStr(slug),
    center: cleanStr(extras.center),                 // centro OcasionPlus completo ("Toledo - Olías del Rey")
    power_hp: powerFrom(v.model, v.name),
    price_reference: extras.price_reference ?? null, // PVP riscado (card span-price)
    price_finance: extras.price_finance ?? null,     // preço financiado (card span-finance)
    monthly: extras.monthly ?? null,                 // cuota €/mes (card)
    condition: cleanStr(offer.itemCondition),
  };
}

// Token estável no fim do slug (ex. ".../…-2024-rtadgqat" -> "rtadgqat"). Chave natural de dedupe.
export function tokenFromSlug(slug) {
  const m = /-([a-z0-9]{6,10})$/i.exec(String(slug || ''));
  return m ? m[1] : null;
}
