// standvirtual/schema.ts — mapeia um `advertSearch.edges[].node` (Advert) do standvirtual.com
// para o registo normalizado comum (+ extras que o StandVirtual oferece).
//
// PORQUÊ este mapeamento: os atributos do veículo vêm num array `parameters[]` de pares
// { key, value, displayValue } — indexamo-lo por `key` e lemos o displayValue (rótulo pt-PT,
// ex. "Gasolina", "Automática") ou o value cru (números). O resto (preço, localização, stand/
// particular, imagem, recência) vem em campos próprios do node. Ver
// research/standvirtual-investigacao.md.

import { toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';

// Registo do StandVirtual = os campos-base comuns + extras próprios do site.
export interface StandvirtualRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  title: string | null;
  seller_type: string | null;
  dealer: string | null;
  seller_uuid: string | null;
  stand_id: string | null;
  city: string | null;
  engine_power_cv: number | null;
  engine_code: string | null;
  origin: string | null;
  category_id: string | null;
  price_evaluation: string | null;
  price_drop: boolean | null;
  listing_created_at: string | null;
}

// Forma mínima do `node` (Advert) que consumimos. Payload externo dinâmico → tudo opcional e
// tipado `unknown`, com narrowing no acesso.
interface RawParam { key?: unknown; value?: unknown; displayValue?: unknown }
interface RawNode {
  parameters?: RawParam[];
  seller?: { __typename?: unknown };
  sellerLink?: { name?: unknown };
  price?: { amount?: { value?: unknown; units?: unknown; currencyCode?: unknown } };
  thumbnail?: { x1?: unknown; x2?: unknown };
  location?: { region?: { name?: unknown }; city?: { name?: unknown } };
  url?: unknown;
  id?: unknown;
  title?: unknown;
  sellerUUID?: unknown;
  standId?: unknown;
  category?: { id?: unknown };
  priceEvaluation?: { indicator?: unknown };
  priceDrop?: unknown;
  createdAt?: unknown;
}

// Indexa parameters[] por key → { value, displayValue }.
function indexParams(node: RawNode): Record<string, RawParam> {
  const idx: Record<string, RawParam> = {};
  for (const p of node.parameters || []) if (p?.key) idx[String(p.key)] = p;
  return idx;
}
const disp = (p: RawParam | undefined): string | null => (p ? cleanStr(p.displayValue ?? p.value) : null);
const val = (p: RawParam | undefined): unknown => (p ? p.value : null);

// seller.__typename → tipo de vendedor uniforme. ProfessionalSeller = stand; PrivateSeller =
// particular. (StandVirtual mistura stands e particulares — distinção pedida no âmbito.)
function sellerType(node: RawNode): string | null {
  const t = node.seller?.__typename;
  if (t === 'ProfessionalSeller') return 'stand';
  if (t === 'PrivateSeller') return 'particular';
  return null;
}

export function normalizeNode(node: RawNode, { collectedAt = null }: { collectedAt?: string | null } = {}): StandvirtualRecord {
  const P = indexParams(node);
  const seller = sellerType(node);
  const dealer = cleanStr(node.sellerLink?.name);      // nome do stand (só stands o têm)
  const amount = node.price?.amount;
  // imagem: preferimos a maior thumbnail (x2 = 640x480); fallback x1.
  const img = node.thumbnail?.x2 || node.thumbnail?.x1 || null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: disp(P.make),
    model: disp(P.model),
    variant: disp(P.version),
    year: toInt(val(P.first_registration_year)),
    km: toInt(val(P.mileage)),
    fuel: disp(P.fuel_type),
    gearbox: disp(P.gearbox),
    engine: toInt(val(P.engine_capacity)),             // cilindrada cm³
    color: null,                                       // não vem nesta projeção da listagem
    doors: null,                                       // idem
    category: null,                                    // node.category traz só um id numérico
    price: amount?.value != null ? toInt(amount.value) : toInt(amount?.units),
    currency: cleanStr(amount?.currencyCode) || 'EUR',
    country: 'PORTUGAL',
    region: cleanStr(node.location?.region?.name),
    postalCode: null,                                  // não disponível na listagem
    source: dealer || (seller === 'particular' ? 'Particular' : null),  // origem concreta
    detail_url: cleanStr(node.url),
    image: cleanStr(img),
    collected_at: collectedAt,

    // --- extras próprios do standvirtual ---
    source_site: 'standvirtual.com',
    id: cleanStr(node.id),
    title: cleanStr(node.title),
    seller_type: seller,                               // 'stand' | 'particular'
    dealer,                                            // nome do stand (null p/ particular)
    seller_uuid: cleanStr(node.sellerUUID),
    stand_id: node.standId != null ? cleanStr(node.standId) : null,
    city: cleanStr(node.location?.city?.name),
    engine_power_cv: toInt(val(P.engine_power)),       // potência (cv)
    engine_code: cleanStr(val(P.engine_code)),
    origin: cleanStr(disp(P.origin)),                  // ex. importado/nacional
    category_id: cleanStr(node.category?.id),
    price_evaluation: cleanStr(node.priceEvaluation?.indicator),  // ABOVE/BELOW/IN_RANGE/NONE
    price_drop: node.priceDrop ? true : null,
    listing_created_at: cleanStr(node.createdAt),      // recência REAL (ISO-8601)
  };
}
