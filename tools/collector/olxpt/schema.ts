// olxpt/schema.ts — taxonomia de marcas + mapeamento de um anúncio SSR do olx.pt para o registo
// normalizado comum (+ extras que o OLX oferece).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo (ver lib/normalize.ts), para
// comparar preços PT vs. UE. Aqui converte-se um objeto de `state.listing.listing.ads[]` (SSR) no
// registo comum. Os atributos do carro vêm num array `params[]` (chave→valor) — mapeados abaixo.
//
// ⚠️ MARCA: o OLX NÃO tem param de marca (só `modelo`). A marca deriva-se de duas fontes:
//   1) no `--full` fatiado por marca, carimba-se a marca da FACETA (`forcedMake`) — autoritativo;
//   2) senão, deteta-se pelo TÍTULO com o dicionário canónico MAKES (a maioria dos títulos começa
//      pela marca; casos como "Vendo smart…" ainda apanham "smart" por procura no título inteiro).

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
export { CAMPOS, toInt, cleanStr };

// Registo do olx.pt = os campos-base comuns + extras próprios do site.
export interface OlxptRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  seller_type: string;
  user_name: string | null;
  user_id: string | null;
  city: string | null;
  power_hp: number | null;
  body_type: string | null;
  seats: number | null;
  origin: string | null;
  condition: string | null;
  first_registration: string | null;
  matricula: string | null;
  vin: string | null;
  co2: string | null;
  doors_bucket: string | null;
  is_promoted: boolean;
  is_highlighted: boolean;
  partner_code: string | null;
  external_url: string | null;
  created_time: string | null;
  last_refresh_time: string | null;
  valid_to_time: string | null;
  title: string | null;
  photos: number | null;
}

interface Make { slug: string; name: string; aliases?: string[] }

// Taxonomia de marcas: { slug (path SEO do OLX), name (rótulo), aliases (p/ deteção no título) }.
// Slugs VALIDADOS por probe (2026-07-12); os poucos não medidos (cauda longa) simplesmente devolvem 0
// e são saltados no --full. Ordem ≈ densidade medida (as densas primeiro no --full). Usada para (a)
// semear o --full e (b) detetar a marca a partir do título.
export const MAKES: Make[] = [
  { slug: 'bmw', name: 'BMW' },
  { slug: 'mercedes-benz', name: 'Mercedes-Benz', aliases: ['mercedes', 'mercedes benz', 'merc'] },
  { slug: 'peugeot', name: 'Peugeot' },
  { slug: 'renault', name: 'Renault' },
  { slug: 'volkswagen-vw', name: 'Volkswagen', aliases: ['volkswagen', 'vw'] },
  { slug: 'citroen', name: 'Citroën', aliases: ['citroen', 'citroën'] },
  { slug: 'audi', name: 'Audi' },
  { slug: 'opel', name: 'Opel' },
  { slug: 'ford', name: 'Ford' },
  { slug: 'fiat', name: 'Fiat' },
  { slug: 'seat', name: 'Seat', aliases: ['seat', 'cupra seat'] },
  { slug: 'nissan', name: 'Nissan' },
  { slug: 'mini', name: 'Mini' },
  { slug: 'toyota', name: 'Toyota' },
  { slug: 'volvo', name: 'Volvo' },
  { slug: 'porsche', name: 'Porsche' },
  { slug: 'smart', name: 'Smart' },
  { slug: 'hyundai', name: 'Hyundai' },
  { slug: 'kia', name: 'Kia' },
  { slug: 'land-rover', name: 'Land Rover', aliases: ['land rover', 'landrover', 'range rover'] },
  { slug: 'dacia', name: 'Dacia' },
  { slug: 'mitsubishi', name: 'Mitsubishi' },
  { slug: 'honda', name: 'Honda' },
  { slug: 'tesla', name: 'Tesla' },
  { slug: 'alfa-romeo', name: 'Alfa Romeo', aliases: ['alfa romeo', 'alfa'] },
  { slug: 'skoda', name: 'Škoda', aliases: ['skoda', 'škoda'] },
  { slug: 'jeep', name: 'Jeep' },
  { slug: 'mazda', name: 'Mazda' },
  { slug: 'jaguar', name: 'Jaguar' },
  { slug: 'ds', name: 'DS', aliases: ['ds automobiles'] },
  { slug: 'mg', name: 'MG' },
  { slug: 'chevrolet', name: 'Chevrolet' },
  { slug: 'suzuki', name: 'Suzuki' },
  { slug: 'cupra', name: 'Cupra' },
  { slug: 'lexus', name: 'Lexus' },
  { slug: 'subaru', name: 'Subaru' },
  // Cauda longa (slugs plausíveis, não medidos — 404 → 0, saltados no --full):
  { slug: 'chrysler', name: 'Chrysler' },
  { slug: 'lancia', name: 'Lancia' },
  { slug: 'ssangyong', name: 'SsangYong', aliases: ['ssangyong'] },
  { slug: 'saab', name: 'Saab' },
  { slug: 'rover', name: 'Rover' },
  { slug: 'abarth', name: 'Abarth' },
  { slug: 'infiniti', name: 'Infiniti' },
  { slug: 'byd', name: 'BYD' },
];

// Índice de deteção: pares [regex, name] ordenados por comprimento do termo desc (multi-palavra
// primeiro, p/ "Mercedes-Benz"/"Land Rover"/"Alfa Romeo" ganharem a "Mercedes"/"Land"/"Alfa").
const DETECT = MAKES.flatMap((m) => {
  const terms = [m.name.toLowerCase(), ...(m.aliases || [])];
  return terms.map((t) => ({ term: t, name: m.name }));
}).sort((a, b) => b.term.length - a.term.length)
  .map(({ term, name }) => {
    // fronteira "de palavra" tolerante a acentos: separadores = início/fim ou não-letra.
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { re: new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, 'iu'), name };
  });

// detectMake: devolve o `name` da 1ª marca (mais longa) que casa no título, ou null.
export function detectMake(title: unknown): string | null {
  const t = cleanStr(title);
  if (!t) return null;
  for (const d of DETECT) if (d.re.test(t)) return d.name;
  return null;
}

// Mapa dos slugs → name (p/ carimbar a marca da faceta no --full).
export const SLUG_TO_NAME: Record<string, string> = Object.fromEntries(MAKES.map((m) => [m.slug, m.name]));

interface RawParam { key?: unknown; value?: unknown; normalizedValue?: unknown }
interface RawAd {
  params?: RawParam[];
  title?: unknown;
  price?: { regularPrice?: { value?: unknown; currencyCode?: unknown } };
  location?: { regionName?: unknown; cityName?: unknown };
  isBusiness?: unknown;
  url?: unknown;
  photos?: unknown;
  id?: unknown;
  user?: { name?: unknown; id?: unknown };
  isPromoted?: unknown;
  isHighlighted?: unknown;
  partner?: { code?: unknown };
  externalUrl?: unknown;
  createdTime?: unknown;
  lastRefreshTime?: unknown;
  validToTime?: unknown;
}

// paramMap: array params[] → { key: {value, normalizedValue} } para acesso rápido.
function paramMap(params: RawParam[] | undefined): Record<string, RawParam> {
  const m: Record<string, RawParam> = {};
  for (const p of params || []) m[String(p.key ?? '')] = p;
  return m;
}
const pv = (P: Record<string, RawParam>, k: string) => cleanStr(P[k]?.value);           // valor legível
const pn = (P: Record<string, RawParam>, k: string) => cleanStr(P[k]?.normalizedValue); // valor normalizado

// variant: título menos a marca (prefixo) e o modelo → sobra a versão/trim (ex. "1.2 Select").
function variantFromTitle(title: unknown, makeName: string | null, model: string | null): string | null {
  let s = cleanStr(title);
  if (!s) return null;
  if (makeName) {
    // remove a 1ª ocorrência da marca (e aliases simples) no início
    for (const term of [makeName, makeName.replace('-', ' ')]) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`^${esc}\\s*`, 'iu'), '');
    }
  }
  if (model) {
    const esc = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`^${esc}\\s*`, 'iu'), '');
  }
  s = cleanStr(s);
  return s && s.toLowerCase() !== (model || '').toLowerCase() ? s : null;
}

// doors: o OLX dá um BUCKET ("4-5"/"1-3"), não um número exato → o campo base fica null (ambíguo) e o
// bucket vai para o extra `doors_bucket`.
function doorsBase(bucket: string | null): number | null {
  if (!bucket) return null;
  return /^\d+$/.test(bucket) ? Number(bucket) : null;
}

// primeira-matrícula "YYYY-MM" a partir de year + first_registration_month.normalizedValue ("11").
function firstReg(year: string | null, mes: string | null): string | null {
  if (!year) return null;
  return mes ? `${year}-${String(mes).padStart(2, '0')}` : String(year);
}

// --- mapeamento anúncio SSR -> registo normalizado --------------------------
// forcedMake: nome da marca da faceta (--full) — carimba autoritativamente; senão deteta-se do título.
export function normalizeAd(a: RawAd, { collectedAt = null, forcedMake = null }: { collectedAt?: string | null; forcedMake?: string | null } = {}): OlxptRecord {
  const P = paramMap(a.params);
  const model = pv(P, 'modelo');
  const make = forcedMake || detectMake(a.title);
  const rp = a.price?.regularPrice;
  const region = cleanStr(a.location?.regionName);
  const isBiz = a.isBusiness === true;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(make),
    model,
    variant: variantFromTitle(a.title, make, model),
    year: toInt(pn(P, 'year')),
    km: toInt(pn(P, 'quilometros')),
    fuel: pv(P, 'combustivel'),
    gearbox: pv(P, 'gearbox'),
    engine: toInt(pn(P, 'engine_capacity')),           // cilindrada cm³
    color: null,                                        // OLX não expõe cor na listagem
    doors: doorsBase(pv(P, 'portas')),                  // bucket → null (ver doors_bucket)
    category: pv(P, 'body_type'),                       // carroçaria/segmento
    price: rp?.value != null ? toInt(rp.value) : null,  // null quando "a combinar"
    currency: cleanStr(rp?.currencyCode) || 'EUR',
    country: 'PORTUGAL',
    region,                                             // distrito
    postalCode: null,                                   // OLX dá cidade, não CP (ver extra city)
    source: isBiz ? (cleanStr(a.user?.name) || 'Stand OLX') : 'OLX (particular)',
    detail_url: cleanStr(a.url),
    image: Array.isArray(a.photos) ? cleanStr(a.photos[0]) : null,
    collected_at: collectedAt,

    // --- extras próprios do olx.pt ---
    source_site: 'olx.pt',
    id: a.id != null ? String(a.id) : null,             // chave natural (numérico → string)
    seller_type: isBiz ? 'business' : 'private',        // stand vs particular (pedido explícito)
    user_name: cleanStr(a.user?.name),
    user_id: a.user?.id != null ? String(a.user.id) : null,
    city: cleanStr(a.location?.cityName),
    power_hp: toInt(pn(P, 'engine_power')),             // potência (cv)
    body_type: pv(P, 'body_type'),
    seats: toInt(pn(P, 'nr_seats')),
    origin: pn(P, 'origin'),                            // national/imported
    condition: pv(P, 'condicao'),                       // Usado/Novo
    first_registration: firstReg(pn(P, 'year') || pv(P, 'year'), pn(P, 'first_registration_month')),
    matricula: pv(P, 'matricula'),
    vin: pv(P, 'vin'),
    co2: pv(P, 'co2_emissions'),                        // string de gama
    doors_bucket: pv(P, 'portas'),                      // "4-5"/"1-3"
    is_promoted: a.isPromoted === true,
    is_highlighted: a.isHighlighted === true,
    partner_code: cleanStr(a.partner?.code),            // ex. cross-post do "standvirtual"
    external_url: cleanStr(a.externalUrl),
    created_time: cleanStr(a.createdTime),              // recência REAL
    last_refresh_time: cleanStr(a.lastRefreshTime),
    valid_to_time: cleanStr(a.validToTime),
    title: cleanStr(a.title),
    photos: Array.isArray(a.photos) ? a.photos.length : null,
  };
}
