// autoscout24/detail.ts — enriquecimento OPCIONAL (--detail) de um anúncio com a sua página de
// detalhe. 1 pedido por anúncio → só faz sentido em fatias estreitas (o utilizador limita via
// facetas/--max-pages). A página de detalhe é também Next.js: `props.pageProps.listingDetails`.
//
// ⚠️ O detalhe vive em /angebote/… que o robots (`User-agent: *`) proíbe; tal como a listagem,
// a recolha é a escolha explícita do utilizador (UA de browser, params livres). Documentado em
// research/autoscout24-investigacao.md.

import { extractNextData } from './parse.ts';
import { toInt, cleanStr } from '../lib/normalize.ts';
import type { HttpClient } from '../lib/http.ts';
import type { Autoscout24Record } from './schema.ts';

const validate = (t: string) => t.includes('__NEXT_DATA__');

// Alguns campos numéricos vêm como { raw, formatted } (ex. consumo, CO2). Extrai o texto útil.
function fmt(o: unknown): string | null {
  if (o == null) return null;
  if (typeof o === 'object') {
    const obj = o as { formatted?: unknown; raw?: unknown };
    return cleanStr(obj.formatted ?? (obj.raw != null ? String(obj.raw) : null));
  }
  return cleanStr(String(o));
}

// Achata o objeto categorizado `equipment` num array de ids (ex. ["Einparkhilfe","Sitzheizung"]).
function flattenEquipment(eq: unknown): string[] | null {
  if (!eq || typeof eq !== 'object') return null;
  const out: string[] = [];
  for (const cat of Object.values(eq)) {
    if (Array.isArray(cat)) for (const item of cat) if (item?.id) out.push(item.id);
  }
  return out.length ? out : null;
}

// Extrai os extras ricos de uma página de detalhe já descarregada (HTML).
export function parseDetail(html: string) {
  const data = extractNextData(html) as { props?: { pageProps?: { listingDetails?: Record<string, unknown> } } } | null;
  const d = data?.props?.pageProps?.listingDetails;
  if (!d) return null;
  const v = (d.vehicle || {}) as Record<string, unknown>;
  const carfax = (d.vehicleReport as { carfax?: Record<string, unknown> } | undefined)?.carfax ?? null;
  return {
    // completa os comuns que faltavam ao nível da listagem:
    color: cleanStr(v.bodyColor),
    doors: toInt(v.numberOfDoors),
    // extras de detalhe:
    body_type: cleanStr(v.bodyType),
    seats: toInt(v.numberOfSeats),
    upholstery: cleanStr(v.upholstery),
    power_hp: toInt(v.powerInHp),
    power_kw_detail: toInt(v.powerInKw),
    gears: toInt(v.gears),
    cylinders: toInt(v.cylinders),
    drivetrain: cleanStr(v.driveTrain),
    fuel_consumption_combined: fmt(v.fuelConsumptionCombined),
    co2_detail: fmt(v.co2emissionInGramPerKmWithFallback),
    first_registration_date: cleanStr(v.firstRegistrationDate || v.firstRegistrationDateRaw),
    had_accident: v.hadAccident === true ? true : (v.hadAccident === false ? false : null),
    hsn_tsn: cleanStr(v.hsnTsn),
    license_plate: cleanStr(v.licensePlate),
    equipment: flattenEquipment(v.equipment),
    description: cleanStr(d.description),
    images_all: Array.isArray(d.images) ? d.images : null,     // todas as fotos (resolução cheia)
    image_count_detail: Array.isArray(d.images) ? d.images.length : null,
    created_at_listing: cleanStr(d.createdTimestampWithOffset), // data de publicação (só no detalhe)
    carfax_url: cleanStr(carfax?.reportUrlEn || carfax?.reportUrlDe),
    warranty: d.warrantyExists === true ? true : (d.warrantyExists === false ? false : null),
    seller_phone: cleanStr(d.whatsappNumber || (d.seller as { phones?: Array<{ callTo?: unknown }> } | undefined)?.phones?.[0]?.callTo),
  };
}

// Descarrega a página de detalhe e devolve o registo enriquecido (ou o original em falha).
export async function enrichWithDetail(http: HttpClient, record: Autoscout24Record, collectedAt: string | null) {
  if (!record.detail_url) return record;
  const html = await http.fetchText(record.detail_url, { validate });
  if (!html) return record;
  const extras = parseDetail(html);
  if (!extras) return record;
  // Não sobrepor comuns já preenchidos; só completar color/doors se estavam vazios.
  const merged = { ...record, ...extras };
  merged.color = record.color ?? extras.color;
  merged.doors = record.doors ?? extras.doors;
  return merged;
}
