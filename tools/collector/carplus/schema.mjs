// carplus/schema.mjs — schema-alvo comum + mapeamento da viatura do payload `__NUXT_DATA__` do
// carplus.pt para o registo normalizado comum (ver lib/normalize.mjs).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado, para comparar
// preços PT vs. UE de forma uniforme. O carplus.pt é uma REDE DE STANDS de usados do Grupo Salvador
// Caetano (stock próprio, certificado; SEM particulares) → não há `owner_type`/vendedor P2P: a fonte
// é sempre profissional. Usamos `source` = nome da instalação/stand exposto (`installationName`,
// ex. "Carplus PT", "Caetano MINI - Faro"), com fallback "Carplus"; `source_site` = 'carplus.pt'.
//
// O payload traz uma viatura RICA (~64 campos) → cobrimos quase todos os CAMPOS_BASE a partir de uma
// única fonte (ao contrário do autopt, onde metade ficava null por só existir no detalhe):
//   brand                         -> make            (ex. "Peugeot")
//   model                         -> model           (ex. "2008")
//   version / commercialDescription -> variant       (ex. "Style 1.2 PureTech 82 CVM5")
//   year                          -> year            (ex. 2016)
//   kilometers                    -> km              (ex. 80831)
//   fuel                          -> fuel            (ex. "Gasolina")
//   transmission                  -> gearbox         (ex. "Manual")
//   displacement                  -> engine          (cilindrada em cc, ex. 1199) ← raro tê-la na listagem
//   color                         -> color           (ex. "Branco")
//   doors                         -> doors           (ex. 5)
//   (não exposto por viatura)     -> category = null (o `segment` só existe como filtro, não no carro)
//   pricePvp                      -> price           (PVP a pronto; canónico)
//   'EUR'                         -> currency
//   'PORTUGAL'                    -> country
//   dealerDistrict                -> region          (ex. "PORTO")
//   (não exposto)                 -> postalCode = null (só distrito/concelho)
//   installationName | 'Carplus'  -> source          (stand da rede)
//   (JSON-LD, por VIN)            -> detail_url
//   imageUrl                      -> image           (CloudFront)
// Extras próprios: source_site, id(=vin), vin, license_plate, price_pvp, price_previous(→descidas),
// monthly_price, taeg, power_cv, seats, traction, environmental_badge, electric_range, condition,
// availability, reserved(reserveType!=1 || blockedVehicle), low_cost, highlighted, dealer_district,
// dealer_municipality, installation, stock, origin, vehicle_used_type, update_time (recência).

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
export { CAMPOS, toInt, cleanStr };

// Devolve o número tal-e-qual se for finito e > 0; senão null (evita falsear stats com 0 sentinela).
function posNum(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Fallback do detail_url quando o JSON-LD não trouxe par para o VIN: reconstrói o slug a partir dos
// campos. Best-effort — normaliza acentos e ruído; na prática o par por VIN cobre ~100%.
function fallbackUrl(v, base) {
  if (!v.vin) return null;
  const slug = [v.brand, v.model, v.version, v.vin]
    .filter(Boolean).join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos (diacríticos combinados)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base}/veiculo/${slug}/`;
}

// `detailUrl` (do JSON-LD, por VIN) e `collectedAt` são injetados por quem chama (parse.mjs).
export function normalizeVehicle(v, { detailUrl = null, collectedAt = null, base = 'https://www.carplus.pt' } = {}) {
  const installation = cleanStr(v.installationName);
  const reserved = Boolean(v.blockedVehicle) || (v.reserveType != null && v.reserveType !== 1);

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(v.brand),
    model: cleanStr(v.model),
    variant: cleanStr(v.version || v.commercialDescription),
    year: posNum(v.year),
    km: toInt(v.kilometers),
    fuel: cleanStr(v.fuel),
    gearbox: cleanStr(v.transmission),
    engine: posNum(v.displacement),                    // cilindrada (cc) — exposta no payload
    color: cleanStr(v.color),
    doors: posNum(v.doors),
    category: null,                                    // segmento/carroçaria não vem por viatura
    price: posNum(v.pricePvp) ?? posNum(v.totalPrice),
    currency: 'EUR',
    country: 'PORTUGAL',
    region: cleanStr(v.dealerDistrict),                // distrito do stand
    postalCode: null,                                  // só distrito/concelho na listagem
    source: installation || 'Carplus',                 // stand da rede (ou "Carplus" genérico)
    detail_url: cleanStr(detailUrl) || fallbackUrl(v, base),
    image: cleanStr(v.imageUrl),
    collected_at: collectedAt,

    // --- extras próprios do carplus ---
    source_site: 'carplus.pt',
    id: cleanStr(v.vin),                               // VIN = chave natural de dedupe/recência
    vin: cleanStr(v.vin),
    license_plate: cleanStr(v.licensePlate),           // matrícula
    price_pvp: posNum(v.pricePvp),
    price_previous: posNum(v.previousPrice),           // preço anterior (>0 → houve descida)
    monthly_price: posNum(v.monthlyPrice),             // mensalidade Credibom
    taeg: posNum(v.taeg),
    power_cv: posNum(v.power),
    seats: posNum(v.seats),
    traction: cleanStr(v.traction),
    environmental_badge: cleanStr(v.environmentalBadge),
    electric_range: posNum(v.electricRange),
    condition: cleanStr(v.condition),                  // "Usado" (rede de usados)
    availability: cleanStr(v.availability),            // "STOCK"
    reserved,                                          // reservado/bloqueado
    low_cost: Boolean(v.lowCost),
    highlighted: Boolean(v.highlightedVehicle),
    dealer_district: cleanStr(v.dealerDistrict),
    dealer_municipality: cleanStr(v.dealerMunicipality),
    installation,                                      // installationName cru (stand)
    stock: cleanStr(v.stock),                          // ex. SCWSSFA_CARPLUS / SCWSSFA_RETAIL_PT
    origin: cleanStr(v.origin),                        // proveniência (retomas/compra grupo)
    vehicle_used_type: cleanStr(v.vehicleUsedType),
    update_time: cleanStr(v.updateTime),              // timestamp de atualização (sinal de recência)
  };
}
