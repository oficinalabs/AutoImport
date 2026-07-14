// santogal/schema.ts — schema-alvo comum + mapeamento do card do santogal.pt para o registo
// normalizado comum (ver lib/normalize.ts).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado, para comparar
// preços PT vs. UE de forma uniforme. O santogal.pt é uma REDE DE STANDS (stock próprio, só
// profissional — sem particulares): `source` é sempre "Santogal" e `owner_type='empresa'`. A
// listagem é SSR (Umbraco) e traz UMA fonte por anúncio (o card), sem JSON-LD por carro.
//
// Campos disponíveis na listagem: make (brand_label), model+variant (model_label), year, km, fuel,
// color, price (+ price_old quando houve descida), image, condition (Usado). Campos SEM
// equivalente na listagem (só no detalhe): gearbox, engine(cilindrada), doors, category, região →
// ficam `null`. Ver research/santogal-investigacao.md.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
export { CAMPOS, toInt, cleanStr };

// Registo do santogal = os campos-base comuns + extras próprios do site.
export interface SantogalRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  node_id: string | null;
  owner_type: string;
  condition: string;
  price_old: number | null;
  vehicle_src: string | null;
}

// Forma mínima do card do santogal que consumimos (produzido pelo parse). Campos derivados só de
// regex+texto são string|null; os que caem no `data-push-object` (JSON externo) ficam `unknown`.
export interface RawCard {
  id: string | null;
  nodeId: string | null;
  detailUrl: string | null;
  make: unknown;
  variant: unknown;
  km: string | null;
  fuel: unknown;
  year: string | null;
  color: string | null;
  price: number | null;
  priceOld: number | null;
  image: string | null;
  condition: unknown;
  src: string | null;
  order: string | null;
  cachedDate: string | null;
}

// Decodifica as entidades HTML comuns dos títulos/nomes PT (&amp; &quot; &#039; &#xB4; acentos).
export function decodeEntities(s: unknown): string | null {
  if (s == null) return null;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
}

// model: o santogal junta modelo+variante no `model_label` ("X2 18 i sDrive Advantage"). Não há um
// campo de modelo isolado na listagem → usamos o 1º token como modelo (best-effort, ex. "X2",
// "e-C4", "500e") e guardamos o texto completo em `variant`. (Documentado na investigação.)
function modelFromVariant(variant: string | null): string | null {
  if (!variant) return null;
  const sp = variant.indexOf(' ');
  return cleanStr(sp > 0 ? variant.slice(0, sp) : variant);
}

// Normaliza um card do santogal → registo comum + extras.
export function normalizeListing(card: RawCard, { collectedAt = null }: { collectedAt?: string | null } = {}): SantogalRecord {
  const make = cleanStr(decodeEntities(card.make));
  const variant = cleanStr(decodeEntities(card.variant));

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make,
    model: modelFromVariant(variant),
    variant,
    year: toInt(card.year),
    km: toInt(card.km),                             // "70.381 kms" → 70381
    fuel: cleanStr(decodeEntities(card.fuel)),
    gearbox: null,                                  // não exposto na listagem (só no detalhe)
    engine: null,                                   // cilindrada não exposta na listagem
    color: cleanStr(decodeEntities(card.color)),
    doors: null,                                    // não exposto na listagem
    category: null,                                 // segmento não exposto por card
    price: toInt(card.price),
    currency: 'EUR',
    country: 'PORTUGAL',
    region: null,                                   // stand específico não exposto no card
    postalCode: null,
    source: 'Santogal',                             // rede de stands (stock próprio, profissional)
    detail_url: cleanStr(card.detailUrl),
    image: cleanStr(decodeEntities(card.image)),
    collected_at: collectedAt,

    // --- extras próprios do santogal ---
    source_site: 'santogal.pt',
    id: cleanStr(card.id),                           // carroId (chave de dedupe/recência)
    node_id: cleanStr(card.nodeId),                  // id do nó Umbraco (usado nos forms/botões)
    owner_type: 'empresa',                           // rede de stands — nunca particular
    condition: cleanStr(decodeEntities(card.condition)) || 'Usado',
    price_old: toInt(card.priceOld),                 // preço anterior (riscado) se houve descida
    vehicle_src: cleanStr(card.src),                 // origem interna do anúncio (ex. "G")
  };
}
