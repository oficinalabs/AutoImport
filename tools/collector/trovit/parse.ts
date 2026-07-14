// trovit/parse.ts — extração dos dados de uma página de listagem do coches.trovit.es.
//
// PADRÃO-MOLDE: theparking/autocasion (JSON-LD estruturado + extras do card HTML, juntos por ID).
// O Trovit é um AGREGADOR, por isso segue a família theparking; a diferença é que a origem do
// anúncio está escondida atrás de um redirecionador (ver schema.ts / http.ts).
//
// Fonte principal = 1 bloco `application/ld+json` por página = `SearchResultsPage` com um array
// `about` de 25 `Car` (make/model/description/year/km/price/doors/image). FALTAM fuel/gearbox/
// potência (tirados da `description` no schema) e faltam detail_url/região/recência → vêm do CARD.
//
// Junção Car↔card pelo `id` do anúncio: no JSON-LD vem no path da imagem
// (`//img-es-2.trovit.com/{id}/{id}.1_11.jpg`); no card é o atributo `data-id`. Nas probes bateu
// certo em 25/25.

import { normalizeCar, type RawCar, type TrovitRecord, type CardExtras } from './schema.ts';

// Resultado do parse de uma página de listagem.
export interface ParsedPage {
  listings: TrovitRecord[];
  total: number | null;
}

// Marcas (slugs canónicos do Trovit ES) para o modo --full. A taxonomia de marcas do Trovit é
// fixa e finita; o site NÃO expõe uma página "todos os coches" (só facetas SEO `/coches/{slug}`),
// por isso fatiamos por marca. Slugs desconhecidos/ raros dão 404/redirect e são simplesmente
// saltados pelo crawl (é inofensivo). `citroen`→ redireciona p/ `citroën` (o lib segue o 301);
// `mercedes` é o slug (não `mercedes-benz`, que dá 404).
export const MARCAS = [
  'audi', 'bmw', 'mercedes', 'volkswagen', 'seat', 'renault', 'peugeot', 'citroen', 'ford', 'opel',
  'toyota', 'nissan', 'hyundai', 'kia', 'fiat', 'dacia', 'skoda', 'volvo', 'mazda', 'mini',
  'land-rover', 'jaguar', 'lexus', 'honda', 'mitsubishi', 'suzuki', 'alfa-romeo', 'jeep', 'porsche',
  'tesla', 'cupra', 'ds', 'smart', 'chevrolet', 'subaru', 'ssangyong', 'lancia', 'mg', 'byd',
  'maserati', 'bentley', 'ferrari', 'lamborghini', 'infiniti', 'isuzu',
];

// Slug de listagem por omissão (sem --full e sem --brand). Não há página "todos os coches" no
// Trovit (rota `/coches` dá 404), por isso escolhemos uma faceta ampla e diversa: a maior cidade,
// que mistura todas as marcas → boa amostra e bom feed de recência para o watch.
export const DEFAULT_SLUG = 'madrid';

// id do anúncio a partir do URL da imagem do JSON-LD: `//host/{id}/{id}.1_11.jpg`.
function idFromImage(url: string | null | undefined): string | null {
  const m = /\/([A-Za-z0-9_-]+)\/\1\./.exec(url || '');
  return m ? m[1] : null;
}

// (1) Extrai o array `about` de `Car` do único bloco JSON-LD (`SearchResultsPage`).
// GOTCHA (como no theparking/autocasion): sanitizamos caracteres de controlo (0x00–0x1f) dentro
// das strings antes do `JSON.parse`, que de outro modo rebentaria com "Bad control character".
export function extractCars(html: string): RawCar[] {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const limpo = m[1].replace(/[\x00-\x1f]+/g, ' ');
    try {
      const j = JSON.parse(limpo) as { about?: unknown };
      const about = Array.isArray(j?.about) ? j.about : (j?.about ? [j.about] : []);
      const cars = about.filter((x) => x && x['@type'] === 'Car');
      if (cars.length) return cars;
    } catch { /* bloco não-SearchResultsPage ou malformado — tentar o próximo */ }
  }
  return [];
}

// "Hace 21 h 21 minutos" / "Hace 3 días" / "Hace 45 minutos" → minutos aproximados (recência).
// Devolve null se não reconhecer. Usado como sinal de frescura no watch e como extra.
export function parseAgoMinutes(text: string | null): number | null {
  if (!text) return null;
  let min = 0, achou = false;
  const unidades: [RegExp, number][] = [
    [/(\d+)\s*(?:semana|semanas)/i, 7 * 24 * 60],
    [/(\d+)\s*(?:d[ií]a|d[ií]as)/i, 24 * 60],
    [/(\d+)\s*(?:h|hora|horas)\b/i, 60],
    [/(\d+)\s*(?:min|minuto|minutos)/i, 1],
  ];
  for (const [re, factor] of unidades) {
    const m = re.exec(text);
    if (m) { min += Number(m[1]) * factor; achou = true; }
  }
  if (/(\d+)\s*(?:mes|meses)/i.test(text)) { min += Number((RegExp as unknown as { $1: string }).$1) * 30 * 24 * 60; achou = true; }
  return achou ? min : null;
}

// (2) Mapa id -> extras do card {detail_url, region, updated_text, updated_ago_min, is_new, title}.
// Dividimos o HTML nos inícios de cada card (`class="item js-item …" data-id="…"`) — mais fiável do
// que depender da tag de fecho — e analisamos o pedaço de cada card.
export function extractCardExtras(html: string): Map<string, CardExtras> {
  const map = new Map<string, CardExtras>();
  const marca = /class="item js-item[^"]*"[^>]*data-id="([^"]+)"/gi;
  const inicios: { index: number; id: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = marca.exec(html)) !== null) inicios.push({ index: m.index, id: m[1] });
  for (let i = 0; i < inicios.length; i++) {
    const { index, id } = inicios[i];
    const chunk = html.slice(index, inicios[i + 1]?.index ?? html.length);
    const href = /href="(https:\/\/rd\.clk\.thribee\.com\/[^"]+)"/.exec(chunk);
    const addr = /item-address">([^<]+)</.exec(chunk);
    const upd = /item-updated-date">([^<]+)</.exec(chunk);
    const title = /item-title">([^<]+)</.exec(chunk);
    map.set(id, {
      id,
      detail_url: href ? href[1] : null,
      region: addr ? addr[1] : null,
      updated_text: upd ? upd[1] : null,
      updated_ago_min: upd ? parseAgoMinutes(upd[1]) : null,
      is_new: /class="new"/.test(chunk),
      title: title ? title[1] : null,
    });
  }
  return map;
}

// (3) Parse completo de uma página → { listings, total }.
// Junta cada Car (JSON-LD) com os extras do card pelo `id` (do path da imagem ↔ data-id).
export function parseListingPage(html: string, { collectedAt = null }: { collectedAt?: string | null } = {}): ParsedPage {
  const cars = extractCars(html);
  const extras = extractCardExtras(html);
  const listings = cars.map((car) => {
    const id = idFromImage(Array.isArray(car.image) ? car.image[0] : car.image);
    return normalizeCar(car, { extras: (id != null ? extras.get(id) : null) || { id }, collectedAt });
  });
  return { listings, total: readTotal(html) };
}

// Total de anúncios da query (`<span data-test='results'>26.652</span>`). Devolve null se ausente.
export function readTotal(html: string): number | null {
  const m = /data-test=['"]results['"]>([\d.]+)</.exec(html);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

// Chave de dedupe / identidade natural: o `id` do anúncio (data-id). Estável entre páginas/sessões.
export function recordId(rec: TrovitRecord): string | null {
  return rec.id != null ? String(rec.id) : (rec.detail_url || null);
}
