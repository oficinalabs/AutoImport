// flexicar/schema.ts — schema-alvo comum + mapeamento do `initialVehicles` do flexicar.es.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.ts), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// veículo do `props.pageProps.initialVehicles` (SSR `__NEXT_DATA__`) no registo comum, estendido com
// os extras que o Flexicar oferece de graça (etiqueta DGT, preços de campanha, potência, galeria).

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
import { BASE } from './http.ts';
export { CAMPOS, toInt, cleanStr };

// Registo do flexicar = os campos-base comuns + extras próprios do site.
export interface FlexicarRecord extends CollectorRecord {
  source_site: string;
  id: number | null;
  dealer: string | null;
  dealership_slug: string | null;
  eco_sticker: string | null;
  power_kw: number | null;
  power_hp: number | null;
  previous_price: number | null;
  retail_price: number | null;
  cash_price: number | null;
  quota_price: number | null;
  offer: boolean;
  outlet: boolean;
  reserved: boolean;
  financiable: boolean;
  tax_deductible: boolean;
  images: unknown[];
}

// Concessionário do array `dealerships` da página SSR. Payload dinâmico → tudo opcional/unknown.
interface DealerRaw { value?: unknown; location?: unknown; name?: unknown; province?: unknown; zipCode?: unknown }
interface DealerInfo { province: unknown; zipCode: unknown }

// Forma mínima de um veículo do `initialVehicles` que consumimos. Payload dinâmico → unknown + narrowing.
interface RawVehicle {
  carDealershipSlug?: unknown;
  version?: unknown;
  image?: unknown;
  images?: unknown;
  brand?: unknown;
  model?: unknown;
  year?: unknown;
  km?: unknown;
  fuel?: unknown;
  transmission?: unknown;
  color?: unknown;
  price?: unknown;
  carDealership?: unknown;
  slug?: unknown;
  id?: number;
  ecoSticker?: unknown;
  previousPrice?: unknown;
  retailPrice?: unknown;
  cashPrice?: unknown;
  quotaPrice?: unknown;
  offer?: unknown;
  outlet?: unknown;
  reserved?: unknown;
  financiable?: unknown;
  taxDeductible?: unknown;
}

// slugify local (sem deps): minúsculas, sem acentos, não-alfanumérico → '-'. Usado para casar a cidade
// do veículo (`carDealershipSlug`, ex. "logrono") com a `location` dos `dealerships` (ex. "Logroño").
function slug(s: unknown): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// buildDealerMap: slug-do-concessionário→{province, zipCode} a partir do array `dealerships` da PRÓPRIA
// página SSR. PORQUÊ: o veículo só traz `carDealershipSlug` (ex. "vitoria", "zaragoza-1"); a província e
// o CP vêm do cruzamento. A chave natural é o `dealerships[].value` (== `carDealershipSlug`); indexamos
// também por `location`/`name` como fallback. Assim resolvemos ~100% (vs. ~66% só por cidade).
export function buildDealerMap(dealerships: DealerRaw[] = []): Map<string, DealerInfo> {
  const map = new Map<string, DealerInfo>();
  for (const d of dealerships) {
    const info = { province: d.province || null, zipCode: d.zipCode || null };
    for (const key of [d.value, d.location, d.name]) {
      const k = slug(key);
      if (k && !map.has(k)) map.set(k, info);
    }
  }
  return map;
}

// Resolve o `carDealershipSlug` do veículo no mapa, tolerando sufixos de índice ("zaragoza-1"→"zaragoza").
function lookupDealer(map: Map<string, DealerInfo>, citySlug: unknown): DealerInfo | null {
  if (!citySlug) return null;
  return map.get(String(citySlug)) || map.get(String(citySlug).replace(/-\d+$/, '')) || null;
}

// Extrai potência do texto de `version` (ex. "1.5 EcoTSI 96kW (130CV) …") → {kw, hp}.
function parsePower(version: unknown): { kw: number | null; hp: number | null } {
  const s = String(version || '');
  const kw = /(\d+)\s*kw/i.exec(s);
  const hp = /(\d+)\s*cv/i.exec(s);
  return { kw: kw ? Number(kw[1]) : null, hp: hp ? Number(hp[1]) : null };
}

// --- mapeamento initialVehicles -> registo normalizado ------------------------
//
// `dealerMap` (cidade→província/CP) e `collectedAt` são injetados por quem chama (parse.ts).
export function normalizeVehicle(v: RawVehicle, { dealerMap = null, collectedAt = null }: { dealerMap?: Map<string, DealerInfo> | null; collectedAt?: string | null } = {}): FlexicarRecord {
  const loc = dealerMap ? lookupDealer(dealerMap, v.carDealershipSlug) : null;
  const power = parsePower(v.version);
  const img = v.image || (Array.isArray(v.images) ? v.images[0] : null);

  return {
    make: cleanStr(v.brand),
    model: cleanStr(v.model),
    variant: cleanStr(v.version),
    year: toInt(v.year),
    km: toInt(v.km),
    fuel: cleanStr(v.fuel),
    gearbox: cleanStr(v.transmission),
    engine: null,                                    // sem cilindrada no SSR (só potência, via version)
    color: cleanStr(v.color),
    doors: null,                                     // não exposto na listagem
    category: null,                                  // carroçaria não exposta por veículo (só faceta)
    price: toInt(v.price),
    currency: 'EUR',
    country: 'SPAIN',
    region: cleanStr(loc?.province),                 // província (derivada da cidade do concessionário)
    postalCode: cleanStr(loc?.zipCode),              // best-effort (1º CP da cidade)
    source: cleanStr(v.carDealership),               // concessionário Flexicar (cidade) = fonte
    detail_url: v.slug ? `${BASE}/coches-ocasion/${String(v.slug)}` : null,
    image: cleanStr(img),
    collected_at: collectedAt,
    // --- extras próprios do flexicar ---
    source_site: 'flexicar.es',
    id: v.id ?? null,
    dealer: cleanStr(v.carDealership),
    dealership_slug: cleanStr(v.carDealershipSlug),
    eco_sticker: cleanStr(v.ecoSticker),             // etiqueta DGT (0/ECO/C/B)
    power_kw: power.kw,
    power_hp: power.hp,
    previous_price: toInt(v.previousPrice),
    retail_price: toInt(v.retailPrice),
    cash_price: toInt(v.cashPrice),
    quota_price: toInt(v.quotaPrice),                // €/mês financiado
    offer: Boolean(v.offer),
    outlet: Boolean(v.outlet),
    reserved: Boolean(v.reserved),
    financiable: Boolean(v.financiable),
    tax_deductible: Boolean(v.taxDeductible),
    images: Array.isArray(v.images) ? v.images : (img ? [img] : []),
  };
}
