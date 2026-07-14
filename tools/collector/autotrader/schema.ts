// autotrader/schema.ts — mapeia um objeto `listings[]` do __NEXT_DATA__ do AutoTrader.nl
// para o registo normalizado comum (+ extras que o AutoTrader oferece).
//
// PORQUÊ __NEXT_DATA__ e não JSON-LD: o AutoTrader (stack Scout24) embute no SSR um array
// `props.pageProps.listings[]` muito mais rico que os blocos JSON-LD — preço, veículo
// completo, localização, vendedor, potência, CO2, imagens. Ver research/autotrader-investigacao.md.

import { toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';

// Registo do AutoTrader = os campos-base comuns + extras próprios do site.
export interface AutotraderRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  city: string | null;
  street: string | null;
  power_kw: number | null;
  co2: string | null;
  first_registration: string | null;
  seller_type: string | null;
  images: number | null;
}

// Forma mínima do objeto `listings[]` do __NEXT_DATA__ que consumimos. O payload externo é
// dinâmico → tipamos só o que lemos, tudo opcional, e narrowing no acesso.
interface VehicleDetail { iconName?: string; data?: unknown }
interface RawListing {
  id?: unknown;
  identifier?: unknown;
  url?: string;
  vehicle?: Record<string, unknown>;
  location?: Record<string, unknown>;
  seller?: Record<string, unknown>;
  vehicleDetails?: VehicleDetail[];
  price?: { priceRaw?: unknown };
  tracking?: { firstRegistration?: unknown };
  wltpValues?: unknown[];
  images?: unknown;
}

// countryCode ISO -> nome em maiúsculas (uniforme com o theparking, que dá "BELGIUM" etc.).
const PAIS: Record<string, string> = { NL: 'NETHERLANDS', DE: 'GERMANY', BE: 'BELGIUM', FR: 'FRANCE', ES: 'SPAIN' };

// Lê um valor de `vehicleDetails[]` pelo iconName (ex. 'calendar', 'speedometer').
function detalhe(vd: VehicleDetail[] | undefined, iconName: string): unknown {
  const d = (vd || []).find((x) => x?.iconName === iconName);
  return d?.data ?? null;
}

export function normalizeListing(L: RawListing, { collectedAt = null }: { collectedAt?: string | null } = {}): AutotraderRecord {
  const v = L.vehicle || {};
  const loc = L.location || {};
  const seller = L.seller || {};
  const vd = L.vehicleDetails || [];

  // Ano: da data de 1ª registo "MM/AAAA" (icon 'calendar'), fallback tracking.firstRegistration.
  const regData = detalhe(vd, 'calendar') || L.tracking?.firstRegistration || null;
  const anoMatch = /(\d{4})/.exec(String(regData || ''));
  // Potência: "160 kW (218 PK)" -> 160 (kW).
  const powMatch = /(\d+)\s*kW/i.exec(String(detalhe(vd, 'speedometer') || ''));
  // CO2: de wltpValues, ex. "170 g/km (gem.)".
  const co2 = (L.wltpValues || []).map(String).find((x) => /g\/km/i.test(x)) || null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(v.make),
    model: cleanStr(v.modelGroup || v.model),
    variant: cleanStr(v.motorTypeName || v.modelVersionInput || v.model),
    year: anoMatch ? Number(anoMatch[1]) : null,
    km: toInt(v.mileageInKm ?? detalhe(vd, 'mileage_odometer')),
    fuel: cleanStr(v.fuel),
    gearbox: cleanStr(v.transmission),
    engine: cleanStr(v.engineDisplacementInCCM),
    color: null,                       // não exposto ao nível da listagem
    doors: null,                       // idem
    category: cleanStr(v.variant),     // no AutoTrader `variant` é a carroçaria (Sedan, SUV…)
    price: toInt(L.price?.priceRaw),
    currency: 'EUR',
    country: PAIS[String(loc.countryCode ?? '')] || cleanStr(loc.countryCode),
    region: null,                      // só há cidade
    postalCode: cleanStr(loc.zip),
    source: cleanStr(seller.companyName),  // origem concreta = o stand/dealer
    detail_url: L.url ? new URL(L.url, 'https://www.autotrader.nl').href : null,
    image: cleanStr(Array.isArray(L.images) ? L.images[0] : L.images),
    collected_at: collectedAt,

    // --- extras próprios do AutoTrader ---
    source_site: 'autotrader.nl',
    id: cleanStr(L.id || L.identifier),
    city: cleanStr(loc.city),
    street: cleanStr(loc.street),
    power_kw: powMatch ? Number(powMatch[1]) : null,
    co2: cleanStr(co2),
    first_registration: cleanStr(regData),   // "MM/AAAA"
    seller_type: cleanStr(seller.type),
    images: Array.isArray(L.images) ? L.images.length : null,
  };
}
