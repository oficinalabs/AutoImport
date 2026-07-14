// autocasion/schema.ts — schema-alvo comum + mapeamento do JSON-LD do autocasion.com.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.ts), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// `Product` (com `offers.itemOffered` = `Car`) — mais os extras do card (fuel/region/dealer) —
// no registo comum, estendido com os extras que o autocasion oferece de graça.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
export { CAMPOS, toInt, cleanStr };

// Registo do autocasion = os campos-base comuns + extras próprios do site.
export interface AutocasionRecord extends CollectorRecord {
  source_site: string;
  id: number | null;
  dealer: string | null;
  dealer_rating: number | null;
  power_hp: number | null;
  condition: string | null;
  certified: boolean;
}

// Extras do card HTML (juntados ao JSON-LD pelo identifier). Injetados por quem chama.
export interface CardExtras {
  fuel?: string | null;
  region?: string | null;
  dealer?: string | null;
  dealer_rating?: number | null;
  certified?: boolean;
}

// Forma mínima do `Product` (JSON-LD) que consumimos. Payload externo dinâmico → tipamos só o
// que lemos, campos opcionais, e narrowing (via cleanStr/toInt) no acesso.
interface EnginePower { value?: unknown; unitCode?: string }
interface Car {
  identifier?: number;
  model?: unknown;
  name?: unknown;
  productionDate?: unknown;
  mileageFromOdometer?: { value?: unknown };
  vehicleTransmission?: unknown;
  color?: unknown;
  numberOfDoors?: unknown;
  bodyType?: unknown;
  manufacturer?: unknown;
  vehicleEngine?: { enginePower?: EnginePower };
}
interface Offer {
  itemOffered?: Car;
  price?: unknown;
  priceCurrency?: unknown;
  url?: unknown;
  itemCondition?: unknown;
}
export interface RawProduct {
  brand?: { name?: unknown };
  name?: unknown;
  image?: unknown;
  color?: unknown;
  offers?: Offer;
}

// --- mapeamento Product + itemOffered(Car) -> registo normalizado ------------
//
// Mapa (documentado para referência rápida):
//   brand.name                              -> make
//   itemOffered.model                       -> model
//   name                                    -> variant (título completo)
//   itemOffered.productionDate              -> year
//   itemOffered.mileageFromOdometer.value   -> km
//   (card)                                  -> fuel        ← não existe no JSON-LD
//   itemOffered.vehicleTransmission         -> gearbox
//   (sem cilindrada no JSON-LD)             -> engine = null
//   itemOffered.color                       -> color
//   itemOffered.numberOfDoors               -> doors
//   itemOffered.bodyType                    -> category
//   offers.price / offers.priceCurrency     -> price / currency
//   'SPAIN'                                  -> country
//   (card, província)                       -> region      ← não existe no JSON-LD
//   (não exposto na listagem)               -> postalCode = null
//   dealer (card)                           -> source
//   offers.url                              -> detail_url
//   image[0]                                -> image
// Extras próprios: source_site, id (=identifier), dealer, dealer_rating, power_hp (enginePower
// BHP), condition (itemCondition), certified (badge "Certificado").
//
// `extras` (do card) e `collectedAt` são injetados por quem chama.
export function normalizeProduct(p: RawProduct, { extras = {}, collectedAt = null }: { extras?: CardExtras; collectedAt?: string | null } = {}): AutocasionRecord {
  const offer = p.offers || {};
  const car = offer.itemOffered || {};
  const power = car.vehicleEngine?.enginePower;
  const powerHp = power && /bhp/i.test(power.unitCode || '') ? toInt(power.value) : toInt(power?.value);
  const img = Array.isArray(p.image) ? p.image[0] : p.image;

  return {
    make: cleanStr(p.brand?.name || p.brand || car.manufacturer),
    model: cleanStr(car.model),
    variant: cleanStr(p.name || car.name),
    year: toInt(car.productionDate),
    km: toInt(car.mileageFromOdometer?.value ?? car.mileageFromOdometer),
    fuel: cleanStr(extras.fuel),
    gearbox: cleanStr(car.vehicleTransmission),
    engine: null,                                    // sem cilindrada no JSON-LD
    color: cleanStr(car.color || p.color),
    doors: toInt(car.numberOfDoors),
    category: cleanStr(car.bodyType),
    price: toInt(offer.price),
    currency: cleanStr(offer.priceCurrency) || 'EUR',
    country: 'SPAIN',
    region: cleanStr(extras.region),
    postalCode: null,                                // não exposto na listagem
    source: cleanStr(extras.dealer),                 // dealer = fonte do anúncio
    detail_url: cleanStr(offer.url),
    image: cleanStr(img),
    collected_at: collectedAt,
    // --- extras próprios do autocasion ---
    source_site: 'autocasion.com',
    id: car.identifier ?? null,
    dealer: cleanStr(extras.dealer),
    dealer_rating: extras.dealer_rating ?? null,
    power_hp: powerHp,
    condition: cleanStr(offer.itemCondition),
    certified: Boolean(extras.certified),
  };
}
