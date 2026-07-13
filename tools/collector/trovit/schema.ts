// trovit/schema.ts — schema-alvo comum + mapeamento do JSON-LD do coches.trovit.es.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.ts), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// `Car` (do array `about` do JSON-LD `SearchResultsPage`) — mais os extras do card (detail_url,
// região, data de atualização) — no registo comum, estendido com os extras que o Trovit dá.
//
// AGREGADOR: o Trovit reúne anúncios de muitos sites, MAS esconde o site de origem atrás de um
// redirecionador de clique (`rd.clk.thribee.com`, robots `Disallow: /`). Como não podemos resolver
// esse redirect sem violar o robots do thribee, o `source` (site de origem) fica **null** e o
// extra `source_site` documenta a plataforma que raspámos (`coches.trovit.es`). A chave natural de
// dedupe é o `id` do anúncio (o `data-id` do card, também embutido no path da imagem).

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
export { CAMPOS, toInt, cleanStr };

// Registo do Trovit = os campos-base comuns + extras próprios do site.
export interface TrovitRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  power_cv: number | null;
  updated_text: string | null;
  updated_ago_min: number | null;
  is_new: boolean;
  title: string | null;
}

// Forma mínima do `Car` do JSON-LD que consumimos (payload externo dinâmico → só o que lemos).
export interface RawCar {
  '@type'?: string;
  description?: unknown;
  offers?: Record<string, unknown>;
  image?: unknown;
  name?: unknown;
  brand?: { name?: unknown } | string;
  model?: unknown;
  vehicleModelDate?: unknown;
  modelDate?: unknown;
  mileageFromOdometer?: { value?: unknown } | number;
  numberOfDoors?: unknown;
}

// Extras do card HTML (juntos ao Car pelo id). Ver parse.ts:extractCardExtras.
export interface CardExtras {
  id: string | null;
  detail_url: string | null;
  region: string | null;
  updated_text: string | null;
  updated_ago_min: number | null;
  is_new: boolean;
  title: string | null;
}

// Vocabulário de combustível/caixa presente na `description` do JSON-LD (ex. "…95CV, Gasolina,
// Manual, 5 puertas"). O JSON-LD NÃO tem campos estruturados para fuel/gearbox/potência → tiramo-los
// da string de descrição, que é uniforme.
const FUEL_RE = /\b(Gasolina|Di[eé]sel|El[eé]ctrico|H[ií]brido(?:\s+enchufable)?|GLP|GNC|Etanol|Hidr[oó]geno)\b/i;
const GEARBOX_RE = /\b(Autom[aá]tico|Manual)\b/i;
const POWER_RE = /(\d{2,4})\s*CV\b/i;

// A variante/trim vem em sítios diferentes conforme a faceta:
//  - páginas de MARCA: o `name` é o título SEO por localização ("AUDI A1 de segunda mano en
//    Alicante") e o trim real está na `description`, antes de " de segunda mano" ("Audi a1 1.0 TFSI
//    95CV Advanced").
//  - páginas de CIDADE: o `name` JÁ É o trim ("Renault ZOE Life 40 R90 …") e a `description` é texto
//    de marketing do stand.
// Heurística: se a description tem "X de segunda mano", usamos X; senão usamos o título do card
// (item-title, não truncado) ou o `name`.
function variantFrom(desc: string, cardTitle: unknown, name: unknown): string | null {
  const m = desc && /^(.*?)\s+de segunda mano\b/i.exec(desc);
  return cleanStr(m ? m[1] : (cardTitle || name || desc));
}

// --- mapeamento Car (JSON-LD `about`) + extras do card -> registo normalizado -----------------
//
// Mapa (documentado para referência rápida):
//   brand.name                          -> make
//   model                               -> model
//   description (trim antes de "de …")  -> variant
//   vehicleModelDate                    -> year
//   mileageFromOdometer.value           -> km
//   description (regex)                 -> fuel        ← não há campo estruturado
//   description (regex)                 -> gearbox     ← não há campo estruturado
//   (sem cilindrada)                    -> engine = null
//   (não exposto na listagem)           -> color = null
//   numberOfDoors                       -> doors
//   (não exposto na listagem)           -> category = null
//   offers.priceSpecification.price/…   -> price / currency
//   'SPAIN'                             -> country
//   (card) item-address                 -> region
//   (não exposto na listagem)           -> postalCode = null
//   (escondido pelo agregador)          -> source = null   ← ver nota no topo
//   (card) href do redirecionador       -> detail_url
//   image                               -> image
// Extras próprios: source_site, id (=data-id), power_cv (CV da description), updated_text +
// updated_ago_min (recência do card), is_new (tag "nuevo"), title (título SEO do card).
export function normalizeCar(car: RawCar, { extras = {}, collectedAt = null }: { extras?: Partial<CardExtras>; collectedAt?: string | null } = {}): TrovitRecord {
  const desc = (car.description as string) || '';
  const offer = (car.offers || {}) as Record<string, unknown>;
  const priceSpec = (offer.priceSpecification || offer) as Record<string, unknown>;
  const img = Array.isArray(car.image) ? car.image[0] : car.image;
  // As imagens vêm protocolo-relativas ("//img-es-2.trovit.com/…") → normalizamos para https.
  const image = img ? cleanStr(String(img).replace(/^\/\//, 'https://')) : null;

  // fuel/gearbox/potência não têm campo estruturado e aparecem em sítios diferentes (name na
  // cidade, description na marca, e no título do card) → procuramos num "palheiro" combinado dos
  // três textos para maximizar a recolha.
  const haystack = [desc, car.name, extras.title].filter(Boolean).join(' · ');
  const fuelM = FUEL_RE.exec(haystack);
  const gbM = GEARBOX_RE.exec(haystack);
  const powerM = POWER_RE.exec(haystack);

  return {
    make: cleanStr((car.brand as { name?: unknown } | undefined)?.name || car.brand),
    model: cleanStr(car.model),
    variant: variantFrom(desc, extras.title, car.name),
    year: toInt(car.vehicleModelDate || car.modelDate),
    km: toInt((car.mileageFromOdometer as { value?: unknown } | undefined)?.value ?? car.mileageFromOdometer),
    fuel: fuelM ? cleanStr(fuelM[1]) : null,
    gearbox: gbM ? cleanStr(gbM[1]) : null,
    engine: null,                                    // sem cilindrada na listagem
    color: null,                                     // não exposto na listagem
    doors: toInt(car.numberOfDoors),
    category: null,                                  // não exposto na listagem
    price: toInt(priceSpec.price),
    currency: cleanStr(priceSpec.priceCurrency) || 'EUR',
    country: 'SPAIN',
    region: cleanStr(extras.region),
    postalCode: null,                                // não exposto na listagem
    source: null,                                    // origem escondida pelo redirecionador (robots)
    detail_url: cleanStr(extras.detail_url),
    image,
    collected_at: collectedAt,
    // --- extras próprios do trovit ---
    source_site: 'coches.trovit.es',
    id: cleanStr(extras.id),
    power_cv: powerM ? toInt(powerM[1]) : null,
    updated_text: cleanStr(extras.updated_text),
    updated_ago_min: extras.updated_ago_min ?? null,
    is_new: Boolean(extras.is_new),
    title: cleanStr(extras.title),
  };
}
