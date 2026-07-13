// custojusto/schema.ts — mapeia um `listItem` do __NEXT_DATA__ do CustoJusto.pt para o registo
// normalizado comum (+ extras que o CustoJusto oferece).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.ts), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// anúncio do `props.pageProps.listItems` no registo comum, estendido com os extras do CustoJusto
// (vendedor Profissional/Particular, distrito/concelho/freguesia, data de publicação real).
//
// LIMITES DA FONTE: o `listItem` só traz `params` = { fuel, gearbox, regdate }. Não há make/model,
// km, cor, portas nem cilindrada estruturados. Resolvemos:
//   • make  → casando o título contra a taxonomia `brands` (matcher injetado);
//   • model → 1º token do título depois da marca; variant → o resto do título;
//   • km / power → best-effort por regex sobre título+corpo (quando o vendedor os escreve);
//   • color/doors/engine → null (não expostos na listagem).

import { toInt, cleanStr, type CollectorRecord } from '../lib/normalize.ts';
import { BASE } from './http.ts';

// Registo do CustoJusto = os campos-base comuns + extras próprios do site.
export interface CustojustoRecord extends CollectorRecord {
  source_site: string;
  id: string | null;
  user_id: string | null;
  seller_type: string;
  seller_name: string | null;
  company_ad: boolean;
  district: string | null;
  county: string | null;
  parish: string | null;
  category_code: string | null;
  power_hp: number | null;
  listing_created_at: string | null;
  image_count: number | null;
  has_video: boolean;
  has_vtour: boolean;
}

// Taxonomia de marca vinda do SSR.
export interface Brand { name: string; shortName: string }

interface RawListItem {
  params?: { fuel?: unknown; gearbox?: unknown; regdate?: unknown };
  title?: unknown;
  locationNames?: { district?: unknown; county?: unknown; parish?: unknown };
  companyAd?: unknown;
  categoryName?: unknown;
  price?: unknown;
  url?: unknown;
  imageFullURL?: unknown;
  listID?: unknown;
  userID?: unknown;
  name?: unknown;
  category?: unknown;
  body?: unknown;
  listTime?: unknown;
  imageCount?: unknown;
  hasVideo?: unknown;
  hasVtour?: unknown;
}

// buildBrandMatcher: recebe a taxonomia [{name, shortName}] e devolve uma função título→{name,
// shortName}|null. Ordena por nome mais longo primeiro para casar marcas multi-palavra
// (Mercedes-Benz, Alfa Romeo, Land Rover) antes de prefixos curtos.
export function buildBrandMatcher(brands: Brand[] = []): (title: unknown) => Brand | null {
  const sorted = [...brands].filter((b) => b?.name).sort((a, b) => b.name.length - a.name.length);
  return (title) => {
    const t = String(title || '').toLowerCase();
    for (const b of sorted) {
      const n = b.name.toLowerCase();
      if (t === n || t.startsWith(n + ' ') || t.startsWith(n + '-')) return b;
    }
    return null;
  };
}

// Extrai km do texto (título/corpo). Ex. "133.000 km", "176000 Km". Devolve int ou null.
function parseKm(...texts: unknown[]): number | null {
  for (const s of texts) {
    const m = /(\d[\d.\s]{2,})\s*km\b/i.exec(String(s || ''));
    if (m) { const n = toInt(m[1]); if (n) return n; }
  }
  return null;
}

// Extrai potência (cv) do texto. Ex. "75 cv", "105cv". Best-effort.
function parsePowerHp(...texts: unknown[]): number | null {
  for (const s of texts) {
    const m = /(\d{2,4})\s*cv\b/i.exec(String(s || ''));
    if (m) return Number(m[1]);
  }
  return null;
}

// model/variant a partir do título, tirando o prefixo da marca e o sufixo de referência " - NN".
function splitModelVariant(title: unknown, brandName?: string | null): { model: string | null; variant: string | null } {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (brandName && t.toLowerCase().startsWith(brandName.toLowerCase())) {
    t = t.slice(brandName.length).replace(/^[\s-]+/, '');
  }
  // sufixo " - 17" (ano curto/ref) que o site acrescenta ao título → fora do variant.
  const semSufixo = t.replace(/\s*-\s*\d{1,3}\s*$/, '').trim();
  const model = semSufixo.split(/\s+/)[0] || null;
  return { model: cleanStr(model), variant: cleanStr(semSufixo) || cleanStr(t) };
}

export function normalizeListing(it: RawListItem, { collectedAt = null, matcher = null, brandHint = null }: { collectedAt?: string | null; matcher?: ((title: unknown) => Brand | null) | null; brandHint?: string | null } = {}): CustojustoRecord {
  const p = it.params || {};
  const brand = (matcher && matcher(it.title)) || (brandHint ? { name: brandHint } : null);
  const { model, variant } = splitModelVariant(it.title, brand?.name);
  const loc = it.locationNames || {};
  const sellerType = it.companyAd ? 'Profissional' : 'Particular';

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(brand?.name),
    model,
    variant,
    year: toInt(p.regdate),
    km: parseKm(it.title, it.body),
    fuel: cleanStr(p.fuel),
    gearbox: cleanStr(p.gearbox),
    engine: null,                              // cilindrada não exposta na listagem
    color: null,                              // cor não exposta na listagem
    doors: null,                              // portas não expostas na listagem
    category: cleanStr(it.categoryName),      // carroçaria (SUV / TT, Sedan, Carrinha…)
    price: toInt(it.price),
    currency: 'EUR',
    country: 'PORTUGAL',
    region: cleanStr(loc.district),           // distrito
    postalCode: null,                         // CP não exposto (só distrito/concelho/freguesia)
    source: cleanStr(sellerType),             // origem = tipo de vendedor (Profissional/Particular)
    detail_url: it.url ? new URL(String(it.url), BASE).href : null,
    image: cleanStr(it.imageFullURL),
    collected_at: collectedAt,

    // --- extras próprios do custojusto ---
    source_site: 'custojusto.pt',
    id: cleanStr(it.listID),
    user_id: cleanStr(it.userID),
    seller_type: sellerType,                  // Profissional | Particular
    seller_name: cleanStr(it.name),           // nome do vendedor/stand
    company_ad: Boolean(it.companyAd),
    district: cleanStr(loc.district),
    county: cleanStr(loc.county),             // concelho
    parish: cleanStr(loc.parish),             // freguesia
    category_code: cleanStr(it.category),     // código numérico da carroçaria
    power_hp: parsePowerHp(it.title, it.body),
    listing_created_at: cleanStr(it.listTime),  // recência REAL (data de publicação)
    image_count: toInt(it.imageCount),
    has_video: Boolean(it.hasVideo),
    has_vtour: Boolean(it.hasVtour),
  };
}
