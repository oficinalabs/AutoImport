// encontracarros/schema.ts — schema-alvo comum + mapeamento do detalhe do encontracarros.pt.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.ts), para comparar preços PT vs. UE de forma uniforme. O encontracarros.pt é um
// AGREGADOR/meta-motor PT (compara standvirtual, olx.pt, custojusto.pt, auto.pt, …): logo o `source`
// é o SITE/STAND DE ORIGEM e o `source_site` é sempre 'encontracarros.pt'.
//
// Fonte 1 (PRINCIPAL) = JSON-LD `Vehicle`; Fonte 2 = objeto `carListing` do RSC (origem + extras).
// Mapa JSON-LD Vehicle -> registo:
//   brand.name                                  -> make
//   model                                       -> model
//   (carListing.title | make+model)             -> variant  (o `name` do JSON-LD é o título da página)
//   dateVehicleFirstRegistered|productionDate   -> year   (ISO; só o ano é real)
//   mileageFromOdometer.value                   -> km
//   fuelType                                     -> fuel
//   vehicleTransmission                          -> gearbox (Manual / Automática)
//   vehicleEngine.enginePower.value+unitText     -> engine  ("250 cv")
//   (carListing.color | color)                   -> color
//   numberOfDoors                                -> doors
//   bodyType                                     -> category (SUV/TT, Citadino, Utilitário, …)
//   offers.price / offers.priceCurrency          -> price / currency
//   offers.availableAtOrFrom.address.addressLocality -> region (distrito/cidade)
//   (país é sempre PORTUGAL — addressCountry=PT)  -> country

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
export { CAMPOS, toInt, cleanStr };

// Registo do encontracarros = os campos-base comuns + extras próprios do agregador PT.
export interface EncontracarrosRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  source_url: string | null;
  dealer: string | null;
  condition: string | null;
  national: string | null;
  seats: number | null;
  listed_at: string | null;
}

// Forma mínima do JSON-LD `Vehicle` que consumimos. Payload externo dinâmico → tipamos só o que
// lemos, tudo opcional, e narrowing no acesso.
interface RawOffer {
  price?: unknown;
  priceCurrency?: unknown;
  url?: string;
  availableAtOrFrom?: { address?: { addressLocality?: unknown } };
}
export interface RawVehicle {
  url?: string;
  offers?: RawOffer;
  brand?: { name?: unknown };
  model?: unknown;
  dateVehicleFirstRegistered?: unknown;
  productionDate?: unknown;
  vehicleModelDate?: unknown;
  mileageFromOdometer?: { value?: unknown };
  fuelType?: unknown;
  vehicleTransmission?: unknown;
  color?: unknown;
  numberOfDoors?: unknown;
  bodyType?: unknown;
  image?: unknown;
  itemCondition?: unknown;
  vehicleSeatingCapacity?: unknown;
  vehicleEngine?: { enginePower?: { value?: unknown; unitText?: unknown } };
}

// Objeto "raw" que o parse constrói (JSON-LD Vehicle + campos do carListing/RSC).
export interface Raw {
  id: string | null;
  detailUrl: string | null;
  veh: RawVehicle | null;
  sourceSite: string | null;
  sourceUrl: string | null;
  dealer: string | null;
  color: string | null;
  condition: string | null;
  national: string | null;
  title: string | null;
  lastmod: string | null;
}

// Descodifica as entidades HTML comuns dos títulos/nomes PT (partilha a mesma lógica dos outros
// coletores PT; os campos do JSON-LD/RSC podem trazer entidades e acentos numéricos).
export function decodeEntities(s: unknown): string | null {
  if (s == null) return null;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
}

// `year`: os campos de data do JSON-LD são ISO ("2011-06-14T23:00:00.000Z") — só o ANO é real.
function yearFromIso(d: unknown): number | null {
  const m = /^(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
}

// `engine`: "250 cv" a partir de vehicleEngine.enginePower {value, unitText}. Null se não houver valor.
function engineOf(veh: RawVehicle): string | null {
  const p = veh?.vehicleEngine?.enginePower;
  if (!p || p.value == null) return null;
  const unit = cleanStr(p.unitText) || 'cv';
  return `${p.value} ${unit}`;
}

// Normaliza o objeto "raw" do parse (Vehicle + carListing) → registo comum + extras.
export function normalizeListing(raw: Raw, { collectedAt = null }: { collectedAt?: string | null } = {}): EncontracarrosRecord {
  const veh: RawVehicle = raw.veh || {};
  const offer: RawOffer = veh.offers || {};
  const addr: { addressLocality?: unknown } = offer.availableAtOrFrom?.address || {};

  const make = cleanStr(decodeEntities(veh.brand?.name || veh.brand));
  const model = cleanStr(decodeEntities(veh.model));
  // variant: o `name` do JSON-LD é o título da PÁGINA ("… Usado (2011) Porto, Portugal — Preço …"),
  // não uma variante limpa → usamos o título do anúncio (`carListing.title`) e caímos em make+model.
  const variant = cleanStr(decodeEntities(raw.title))
    || cleanStr([make, model].filter(Boolean).join(' ')) || null;

  const site = cleanStr(raw.sourceSite);                 // olx.pt / standvirtual.com / custojusto.pt / …
  const dealer = cleanStr(decodeEntities(raw.dealer));   // nome do vendedor/stand (ou null)
  const cond = raw.condition || veh.itemCondition;
  const isUsed = cond ? /Used/i.test(String(cond)) : null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make,
    model,
    variant,
    year: yearFromIso(veh.dateVehicleFirstRegistered || veh.productionDate || veh.vehicleModelDate),
    km: toInt(veh.mileageFromOdometer?.value ?? veh.mileageFromOdometer),
    fuel: cleanStr(decodeEntities(veh.fuelType)),
    gearbox: cleanStr(decodeEntities(veh.vehicleTransmission)),
    engine: engineOf(veh),
    color: cleanStr(decodeEntities(raw.color || veh.color)),
    doors: toInt(veh.numberOfDoors),
    category: cleanStr(decodeEntities(veh.bodyType)),
    price: toInt(offer.price),
    currency: cleanStr(offer.priceCurrency) || 'EUR',
    country: 'PORTUGAL',                                 // agregador PT — addressCountry=PT sempre
    region: cleanStr(decodeEntities(addr.addressLocality)), // distrito/cidade
    postalCode: null,                                    // não exposto na página de detalhe
    source: site || 'desconhecido',                      // SITE/STAND DE ORIGEM (é agregador)
    detail_url: cleanStr(raw.detailUrl),
    image: cleanStr(Array.isArray(veh.image) ? veh.image[0] : veh.image),
    collected_at: collectedAt,

    // --- extras próprios do encontracarros.pt ---
    source_site: 'encontracarros.pt',
    id: cleanStr(raw.id),                                // id de 6 chars (dedupe/estado)
    source_url: cleanStr(raw.sourceUrl),                 // URL do anúncio ORIGINAL (no site de origem)
    dealer,                                              // nome do vendedor/stand (null se não exposto)
    condition: isUsed === null ? null : (isUsed ? 'Usado' : 'Novo'),
    national: raw.national ? (/import/i.test(raw.national) ? 'Importado' : 'Nacional') : null,
    seats: toInt(veh.vehicleSeatingCapacity),
    listed_at: cleanStr(raw.lastmod),                    // recência (lastmod do sitemap)
  };
}
