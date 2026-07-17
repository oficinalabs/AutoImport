// caetano/schema.ts — schema-alvo comum + mapeamento de uma viatura da API `search/v2` da Caetano
// (Grupo Salvador Caetano / Caetano Baviera Portugal) para o registo normalizado comum.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.ts), para comparar preços PT vs. UE de forma uniforme. A API devolve, por viatura,
// um objeto JSON RICO e já estruturado (marca/modelo/versão separados, ano, km, combustível, caixa,
// cilindrada, cor, portas, lugares, preço, distrito/concelho do concessionário, VIN, matrícula…).
//
// REDE DE STANDS (só profissional): a Caetano é o retalho do Grupo Salvador Caetano. TODO o stock é
// de concessionários/instalações do grupo (Caetano Opel/Peugeot/BMW, Carplus…), NUNCA de
// particulares → `owner_type='empresa'` fixo e `source` = nome da INSTALAÇÃO (`installationName`,
// ex. "Caetano Opel - Porto", "Carplus PT"); fallback 'Caetano'. `source_site='caetano.pt'`.
//
// FILTRO (ver parse.ts): a pesquisa de usados devolve maioritariamente `condition='Usado'` mas
// mistura ~1% de `Novo` e ~28% de MOTAS (`vehicleType='MOTORCYCLE'`). Como o alvo são CARROS
// usados, o parse mantém só `vehicleType='CAR'` E `condition='Usado'` (inclui os "Semi-Novo").

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
import { SITE } from './http.ts';
export { CAMPOS, toInt, cleanStr };

// Registo da Caetano = os campos-base comuns + extras próprios do site.
export interface CaetanoRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  vin: string | null;
  license_plate: string | null;
  owner_type: string;
  dealer: string | null;
  dealer_id: string | null;
  dealer_municipality: string | null;
  condition: string | null;
  used_type: string | null;
  origin: string | null;
  power_cv: number | null;
  displacement_cc: number | null;
  seats: number | null;
  traction: string | null;
  traction_4x4: boolean | null;
  environmental_badge: string | null;
  electric_range_km: number | null;
  price_previous: number | null;
  monthly_price: number | null;
  stock: string | null;
  stock_id: unknown;
  highlighted: boolean | null;
  availability: string | null;
  update_time: string | null;
}

// slugify: réplica EXATA do slug builder da SPA (função `Bo` do bundle) para reconstruir o detail_url.
// NFD → remove diacríticos → remove tudo o que não seja [\w\s-] → espaços/hífens em '-' → trim → minúsc.
// (Sem flag unicode no \w, tal como no site: os acentos já foram removidos pelo passo NFD.)
export function slugify(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

// detail_url legível: `https://caetano.pt/pesquisa/{marca}-{modelo}-{versao}-{vin}/` (o vin em
// minúsculas). Bate 1:1 com o link que a SPA gera (confirmado: resolve 200). Null sem VIN.
function detailUrl(v: Record<string, unknown>): string | null {
  if (!v.vin) return null;
  const slug = [v.brand, v.model, v.version].map((x) => slugify(x)).join('-');
  return `${SITE}/pesquisa/${slug}-${String(v.vin).toLowerCase()}/`;
}

// num: arredonda um NÚMERO da API (já vem limpo, ex. 129.2, 9900.0) para inteiro. NÃO usamos o
// toInt do lib nestes campos — o toInt remove o ponto decimal e colava os dígitos (129.2 → 1292).
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Descarta valores "vazios" que a API devolve como 0/placeholder (km e preço são reais; mas portas,
// lugares, cilindrada, autonomia elétrica e preço anterior vêm 0 quando "não aplicável/desconhecido").
const nz = (n: number | null) => (n == null || n === 0 ? null : n);

// --- mapeamento viatura da API -> registo normalizado ------------------------
//
// Mapa (referência rápida):
//   brand                                    -> make
//   model                                    -> model
//   version (fallback commercialDescription) -> variant
//   year                                     -> year
//   kilometers                               -> km
//   fuel                                     -> fuel     (Gasolina/Diesel/Elétrico/Híbrido…)
//   transmission                             -> gearbox  (Manual/Automática)
//   displacement                             -> engine   (cilindrada cm³)
//   color                                    -> color
//   doors                                    -> doors
//   (segmento não vem por viatura)           -> category = null
//   pricePvp                                 -> price
//   'EUR'                                    -> currency
//   'PORTUGAL'                               -> country
//   dealerDistrict                           -> region   (distrito do concessionário)
//   (só distrito/concelho, sem CP)           -> postalCode = null
//   installationName                         -> source   (nome do stand/instalação do grupo)
//   (reconstruído)                           -> detail_url
//   imageUrl                                 -> image
// Extras: source_site, id (=VIN), vin, license_plate, owner_type('empresa'), dealer, dealer_id,
// dealer_municipality, condition, used_type, origin, power_cv, displacement_cc, seats, traction,
// traction_4x4, environmental_badge, electric_range_km, price_previous, monthly_price, stock,
// stock_id, highlighted, availability, update_time.
export function normalizeVehicle(v: Record<string, unknown>, { collectedAt = null }: { collectedAt?: string | null } = {}): CaetanoRecord {
  const dealer = cleanStr(v.installationName);
  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(v.brand),
    model: cleanStr(v.model),
    variant: cleanStr(v.version) || cleanStr(v.commercialDescription),
    year: num(v.year),
    km: num(v.kilometers),
    fuel: cleanStr(v.fuel),
    gearbox: cleanStr(v.transmission),
    engine: nz(num(v.displacement)),            // cilindrada cm³ (como o autohero/autoboerse)
    color: cleanStr(v.color),
    doors: nz(num(v.doors)),
    category: null,                             // segmento/carroçaria não exposto por viatura
    price: nz(num(v.pricePvp)) ?? nz(num(v.totalPrice)),
    currency: 'EUR',
    country: 'PORTUGAL',
    region: cleanStr(v.dealerDistrict),         // distrito do concessionário
    postalCode: null,                           // só distrito/concelho na API
    source: dealer || 'Caetano',                // instalação/stand do grupo (rede profissional)
    detail_url: detailUrl(v),
    image: cleanStr(v.imageUrl),
    collected_at: collectedAt,

    // --- extras próprios da Caetano ---
    source_site: 'caetano.pt',
    id: cleanStr(v.vin),                        // VIN = chave natural (dedupe/join; entra no detail_url)
    vin: cleanStr(v.vin),
    license_plate: cleanStr(v.licensePlate),
    owner_type: 'empresa',                      // rede de stands — nunca particular
    dealer,                                     // nome da instalação (== source)
    dealer_id: cleanStr(v.externalDealerId || v.dealerId),
    dealer_municipality: cleanStr(v.dealerMunicipality),
    condition: cleanStr(v.condition),           // 'Usado' (após filtro)
    used_type: cleanStr(v.vehicleUsedType),     // 'Semi-Novo' | 'Não Definido' | …
    origin: cleanStr(v.origin),                 // 'R - Retomas VN', 'I - Compra Diret Imp', …
    // LIMITAÇÃO (HEV Toyota): a API tem um ÚNICO campo `power`, preenchido pelo
    // stand — inconsistente para os full-hybrid (o mesmo Yaris 1.5 HEV aparece a
    // 92cv térmicos, 116cv de sistema ou 0). NÃO há campo separado de potência de
    // sistema (só `power`, `engine`, `displacement`), pelo que o parser não pode
    // preferir a do sistema de forma fiável — os ~92cv vetam o match do catálogo
    // (que lista 116). Não se relaxa a tolerância de potência (precisão primeiro).
    power_cv: nz(num(v.power)),
    displacement_cc: nz(num(v.displacement)),
    seats: nz(num(v.seats)),
    traction: cleanStr(v.traction),
    traction_4x4: typeof v.traction4x4 === 'boolean' ? v.traction4x4 : null,
    environmental_badge: v.environmentalBadge && v.environmentalBadge !== 'UNKNOWN' ? cleanStr(v.environmentalBadge) : null,
    electric_range_km: nz(num(v.electricRange)),
    price_previous: nz(num(v.previousPrice)),   // histórico de preço (quando presente)
    monthly_price: nz(num(v.monthlyPrice)),     // mensalidade indicativa (financiamento)
    stock: cleanStr(v.stock),                   // origem do feed (ex. SCWSSFA_CARPLUS)
    stock_id: v.stockId ?? null,
    highlighted: typeof v.highlightedVehicle === 'boolean' ? v.highlightedVehicle : null,
    availability: cleanStr(v.availability),     // STOCK / …
    update_time: cleanStr(v.updateTime),        // timestamp de sync do feed (recência aproximada)
  };
}
