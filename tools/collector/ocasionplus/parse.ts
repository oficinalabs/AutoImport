// ocasionplus/parse.ts — extração dos dados de uma página de listagem do ocasionplus.com.
//
// PADRÃO-MOLDE: autocasion/theparking (JSON-LD como fonte principal + extras do card HTML, juntos
// por ID), NÃO o `__NEXT_DATA__` do autotrader/autoboerse. O OcasionPlus é Next.js App Router (RSC
// via `self.__next_f`), mas o RSC vem em pedaços sem um objeto-por-carro limpo; felizmente serve um
// JSON-LD `ItemList` rico (20 `Vehicle` por página), que é a forma mais robusta de recolher.
//
// Fonte principal = 1 bloco `application/ld+json` do tipo `ItemList` = `itemListElement` com 20
// `Vehicle`. Cada Vehicle traz make/model/variant/year/km/fuel/gearbox/price/url/image/condition.
//
// FALTAM ao JSON-LD: a REGIÃO/centro e os preços de referência/financiado → vêm do CARD HTML. Cada
// card `<div class="…__card">` tem `data-test` spans (span-price, span-finance, span-finace-quote,
// div-dealer). Juntamos card↔JSON-LD pelo TOKEN no fim do slug do URL (ex. ".../…-2024-rtadgqat").

import { normalizeVehicle, tokenFromSlug, type RawVehicle, type CardExtras, type OcasionplusRecord } from './schema.ts';

// Resultado do parse de uma página de listagem.
export interface ParsedPage {
  listings: OcasionplusRecord[];
  total: number | null;
}

// (1) Extrai o array de `Vehicle` do bloco JSON-LD `ItemList` da página.
// GOTCHA (como no theparking/autocasion): sanitizamos caracteres de controlo (0x00–0x1f) dentro
// das strings antes do `JSON.parse`, que de outro modo tornariam o JSON inválido.
export function extractVehicles(html: string): RawVehicle[] {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const limpo = m[1].replace(/[\x00-\x1f]+/g, ' ');
    try {
      const j = JSON.parse(limpo);
      if (j && j['@type'] === 'ItemList' && Array.isArray(j.itemListElement)) {
        return j.itemListElement.filter((x: unknown) => x && (x as { '@type'?: unknown })['@type'] === 'Vehicle');
      }
    } catch { /* bloco não-ItemList ou malformado — tentar o próximo */ }
  }
  return [];
}

// Total de anúncios da query: `offerCount` do bloco `AggregateOffer` (Product). Ex. 13696 (geral)
// ou 594 (marca). Devolve null se não encontrar.
export function readTotal(html: string): number | null {
  const m = /"offerCount":(\d+)/.exec(html);
  return m ? Number(m[1]) : null;
}

// (2) Mapa token → extras do card {region, center, price_reference, price_finance, monthly}.
// Dividimos o HTML nos inícios de cada card (a classe `…__card"` é o marcador estável) e analisamos
// o pedaço de cada card. O token vem do href; os valores dos `data-test` spans.
const CARD_MARK = /cardVehicle-module-scss-module__[a-z0-9]+__card"/gi;

export function extractCardExtras(html: string): Map<string, CardExtras> {
  const map = new Map<string, CardExtras>();
  const inicios: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = CARD_MARK.exec(html)) !== null) inicios.push(m.index);
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i], inicios[i + 1] ?? html.length);
    const href = /href="\/coches-segunda-mano\/([a-z0-9-]+)"/i.exec(chunk);
    if (!href) continue;
    const id = tokenFromSlug(href[1]);
    if (!id) continue;
    // Centro (div-dealer): "Toledo - Olías del Rey" → região = província (1º segmento antes de " - ").
    const centerRaw = /data-test="div-dealer"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk);
    const center = centerRaw ? centerRaw[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null : null;
    const region = center ? center.split(' - ')[0].trim() || null : null;
    map.set(id, {
      id,
      region,
      center,
      price_reference: spanInt(chunk, 'span-price'),   // PVP riscado
      price_finance: spanInt(chunk, 'span-finance'),   // preço financiado (destaque)
      monthly: spanInt(chunk, 'span-finace-quote'),    // cuota €/mes (typo "finace" é do próprio site)
    });
  }
  return map;
}

// Lê o inteiro do primeiro `data-test="{name}"` do card ("29.100€" -> 29100). null se ausente.
function spanInt(chunk: string, name: string): number | null {
  const re = new RegExp(`data-test="${name}"[^>]*>([^<]*)`, 'i');
  const m = re.exec(chunk);
  if (!m) return null;
  const digits = m[1].replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// (3) Parse completo de uma página → { listings, total }.
// Junta cada Vehicle (JSON-LD) com os extras do card pelo token do slug.
export function parseListingPage(html: string, { collectedAt = null }: { collectedAt?: string | null } = {}): ParsedPage {
  const vehicles = extractVehicles(html);
  const extras = extractCardExtras(html);
  const listings = vehicles.map((v) => {
    const url = v.offers?.url || null;
    let token: string | null = null;
    try { token = url ? tokenFromSlug(new URL(String(url)).pathname) : null; } catch { /* url inválido */ }
    const ex = (token != null ? extras.get(token) : null) || {};
    return normalizeVehicle(v, { extras: ex, collectedAt });
  });
  return { listings, total: readTotal(html) };
}

// Slugs de marca para o modo --full: a página `/marcas` lista landing-pages `/coches-segunda-mano/
// {marca}` e `/coches-segunda-mano/{marca}/{modelo}`. As MARCAS são os 1ºs segmentos que têm filhos
// de modelo (2 segmentos) — critério robusto que exclui provínas/carroçarias (que não têm modelos).
export function extractBrandSlugs(html: string): string[] {
  const set = new Set<string>();
  const re = /\/coches-segunda-mano\/([a-z0-9-]+)\/[a-z0-9-]+"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) set.add(m[1].toLowerCase());
  return [...set];
}

// Chave de dedupe / sinal de recência: o token do slug (código estável por anúncio).
export function recordId(rec: OcasionplusRecord): string | null {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
