// autoboerse/schema.ts — mapeia um objeto `classifiedList[]` do __NEXT_DATA__ do autoboerse.de
// para o registo normalizado comum (+ extras que o autoboerse oferece).
//
// PORQUÊ __NEXT_DATA__: o autoboerse embute no SSR um array `classifiedList[]` riquíssimo —
// veículo completo, preço, potência, CO2 (WLTP), 1ª-registo, TÜV (huDate), dono anterior,
// acidentes, dealer, cidade/CP, e — o que faltava no AutoTrader — `createdAt` (recência real).
// Ver research/autoboerse-investigacao.md.

import { toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';

const BASE = 'https://autoboerse.de';
const CDN = 'https://img.autoboerse.de/';   // cdnURL do runtimeConfig; URL = CDN + imageList[].name

// Registo do autoboerse = os campos-base comuns + extras próprios do site.
export interface AutoboerseRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  visibleId: string | null;
  dealer: string | null;
  city: string | null;
  power_kw: number | null;
  power_ps: number | null;
  co2: string | null;
  first_registration: string | null;
  hu_date: string | null;
  previous_owner: number | null;
  accidents: boolean | null;
  listing_created_at: string | null;
  images: number | null;
}

// Forma mínima do objeto `classifiedList[]` do __NEXT_DATA__ que consumimos. Payload dinâmico
// → tipamos só o que lemos, tudo opcional, e narrowing no acesso.
interface Named { name?: unknown }
interface RawClassified {
  id?: unknown;
  visibleId?: unknown;
  version?: unknown;
  engine?: Record<string, unknown>;
  registration?: Record<string, unknown>;
  showroomList?: unknown;
  efficiency?: { wltp?: { co2EmissionsCombined?: { amount?: number; unit?: string } } };
  imageList?: unknown;
  make?: Named;
  model?: { name?: unknown; original?: unknown };
  mileage?: { amount?: unknown };
  fuel?: Named;
  transmission?: Named;
  color?: Named;
  measures?: { bodyDoors?: unknown };
  body?: Named;
  price?: { amount?: unknown; currency?: unknown };
  currentProvince?: Named;
  dealer?: Named;
  huDate?: unknown;
  previousOwner?: number;
  accidents?: unknown;
  createdAt?: unknown;
}

// Transliteração alemã para slug (ä→ae, ö→oe, ü→ue, ß→ss) — usada só no fallback do detail_url.
function slugify(s: unknown): string {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// URL de detalhe: preferimos o path lido do HTML (parse.ts); se faltar, reconstruímos o slug
// a partir de make/model/fuel/província (padrão observado: {make}-{model}-{fuel}-{provincia}).
function detailUrl(C: RawClassified, detailPath: string | null): string | null {
  if (detailPath) return new URL(detailPath, BASE).href;
  if (!C.visibleId) return null;
  const slug = [C.make?.name, C.model?.name, C.fuel?.name, C.currentProvince?.name]
    .map(slugify).filter(Boolean).join('-');
  return `${BASE}/fahrzeugsuche/${slug}/${String(C.visibleId)}`;
}

export function normalizeListing(C: RawClassified, { collectedAt = null, detailPath = null }: { collectedAt?: string | null; detailPath?: string | null } = {}): AutoboerseRecord {
  const eng = C.engine || {};
  const reg = C.registration || {};
  const showroom = Array.isArray(C.showroomList) ? C.showroomList[0] : null;
  // CO2: WLTP combinado, ex. { amount: 166, unit: "g/km" } → "166 g/km".
  const co2v = C.efficiency?.wltp?.co2EmissionsCombined;
  const co2 = co2v?.amount != null ? `${co2v.amount} ${co2v.unit || 'g/km'}` : null;
  // 1ª-registo "MM/AAAA" a partir de registration.month/year.
  const firstReg = reg.year ? `${String(reg.month || '').padStart(2, '0') || '??'}/${String(reg.year)}` : null;
  const img0 = Array.isArray(C.imageList) ? C.imageList.find((i) => i.default) || C.imageList[0] : null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(C.make?.name),
    model: cleanStr(C.model?.name),
    variant: cleanStr(C.version || C.model?.original),
    year: reg.year ? Number(reg.year) : null,
    km: toInt(C.mileage?.amount),
    fuel: cleanStr(C.fuel?.name),
    gearbox: cleanStr(C.transmission?.name),
    engine: toInt(eng.cc),
    color: cleanStr(C.color?.name),
    doors: toInt(C.measures?.bodyDoors),
    category: cleanStr(C.body?.name),
    price: toInt(C.price?.amount),
    currency: cleanStr(C.price?.currency) || 'EUR',
    country: 'GERMANY',
    region: cleanStr(C.currentProvince?.name),
    postalCode: cleanStr(showroom?.postalCode),
    source: cleanStr(C.dealer?.name),       // origem concreta = o stand/dealer
    detail_url: detailUrl(C, detailPath),
    image: img0?.name ? CDN + img0.name : null,
    collected_at: collectedAt,

    // --- extras próprios do autoboerse ---
    source_site: 'autoboerse.de',
    id: cleanStr(C.id),
    visibleId: cleanStr(C.visibleId),
    dealer: cleanStr(C.dealer?.name),
    city: cleanStr(showroom?.city),
    power_kw: toInt(eng.powerKw),
    power_ps: toInt(eng.powerPs),
    co2: cleanStr(co2),
    first_registration: firstReg,           // "MM/AAAA"
    hu_date: cleanStr(C.huDate),             // TÜV
    previous_owner: C.previousOwner ?? null,
    accidents: typeof C.accidents === 'boolean' ? C.accidents : null,
    listing_created_at: cleanStr(C.createdAt),   // recência REAL (vantagem vs AutoTrader)
    images: Array.isArray(C.imageList) ? C.imageList.length : null,
  };
}
