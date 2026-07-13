// quoka/schema.mjs — schema-alvo comum + mapeamento do card `article-item` (+ JSON-LD `Vehicle`)
// do quoka.de para o registo normalizado comum (ver lib/normalize.mjs).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado, para comparar
// preços PT vs. UE de forma uniforme. O quoka é P2P (classificados de particulares): a listagem
// não estrutura marca/modelo (vêm em texto livre no título) e não nomeia o vendedor — por isso
// `source='particular'` e a marca sai do slug da query (--full/--brand) ou de um dicionário sobre
// o título. Campos como gearbox/color/doors não existem estruturados na listagem. Ver
// research/quoka-investigacao.md.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
export { CAMPOS, toInt, cleanStr };

// Decodifica as entidades HTML numéricas/nomeadas comuns dos títulos alemães (ü = &#252; etc.).
export function decodeEntities(s) {
  if (s == null) return null;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–');
}

// Dicionário de marcas: slug canónico → regex de deteção no título (com alias). Ordenado por
// especificidade (multi-palavra/alias primeiro) para não confundir "mercedes benz" com "benz".
// Usado só quando não há brandHint (listagem geral). Slug canónico serve de `make`.
const MARCAS = [
  ['Mercedes-Benz', /\b(mercedes[- ]?benz|mercedes|benz)\b/i],
  ['Volkswagen', /\b(volkswagen|vw)\b/i],
  ['Alfa Romeo', /\balfa[- ]?romeo\b/i],
  ['Land Rover', /\bland[- ]?rover\b/i],
  ['BMW', /\bbmw\b/i], ['Audi', /\baudi\b/i], ['Opel', /\bopel\b/i], ['Ford', /\bford\b/i],
  ['Skoda', /\b(skoda|škoda)\b/i], ['Renault', /\brenault\b/i], ['Peugeot', /\bpeugeot\b/i],
  ['Toyota', /\btoyota\b/i], ['Fiat', /\bfiat\b/i], ['Seat', /\bseat\b/i], ['Kia', /\bkia\b/i],
  ['Hyundai', /\bhyundai\b/i], ['Nissan', /\bnissan\b/i], ['Mazda', /\bmazda\b/i],
  ['Citroen', /\b(citroen|citroën)\b/i], ['Dacia', /\bdacia\b/i], ['Volvo', /\bvolvo\b/i],
  ['Mini', /\bmini\b/i], ['Mitsubishi', /\bmitsubishi\b/i], ['Suzuki', /\bsuzuki\b/i],
  ['Honda', /\bhonda\b/i], ['Porsche', /\bporsche\b/i], ['Jeep', /\bjeep\b/i],
  ['Smart', /\bsmart\b/i], ['Tesla', /\btesla\b/i], ['Cupra', /\bcupra\b/i],
  ['Chevrolet', /\bchevrolet\b/i], ['Chrysler', /\bchrysler\b/i], ['Jaguar', /\bjaguar\b/i],
  ['Lancia', /\blancia\b/i], ['Subaru', /\bsubaru\b/i], ['Saab', /\bsaab\b/i],
  ['Daihatsu', /\bdaihatsu\b/i], ['Lexus', /\blexus\b/i], ['Maserati', /\bmaserati\b/i],
  ['Ferrari', /\bferrari\b/i], ['Lamborghini', /\blamborghini\b/i], ['Bentley', /\bbentley\b/i],
  ['Rover', /\brover\b/i], ['Trabant', /\btrabant\b/i], ['Wartburg', /\bwartburg\b/i],
];

// Slugs de --full/--brand → nome de marca legível (só os que divergem do capitalize simples).
const SLUG_MAKE = {
  volkswagen: 'Volkswagen', mercedes: 'Mercedes-Benz', bmw: 'BMW', mg: 'MG', ds: 'DS',
  gmc: 'GMC', citroen: 'Citroen', skoda: 'Skoda', 'alfa-romeo': 'Alfa Romeo',
  'land-rover': 'Land Rover', ssangyong: 'SsangYong',
};
export function makeFromSlug(slug) {
  if (!slug) return null;
  return SLUG_MAKE[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Deteta a marca no título (fallback quando não há brandHint) e o "model" = token seguinte.
function makeModelFromTitle(title) {
  if (!title) return { make: null, model: null };
  for (const [nome, re] of MARCAS) {
    const m = re.exec(title);
    if (m) {
      // model = 1ª palavra "significativa" depois do match (ignora pontuação/números soltos).
      const rest = title.slice(m.index + m[0].length).trim();
      const tok = (rest.match(/[A-Za-z0-9][\wäöüßÄÖÜ.-]*/) || [])[0] || null;
      return { make: nome, model: cleanStr(tok) };
    }
  }
  return { make: null, model: null };
}

// Normaliza um card (Fonte 2) + o Vehicle do JSON-LD (Fonte 1, opcional) → registo comum + extras.
// `brandHint` (slug do --full/--brand) fixa a marca; senão infere-se do título.
export function normalizeListing(card, { ld = null, brandHint = null, collectedAt = null } = {}) {
  const title = decodeEntities(card.title);
  const desc = decodeEntities(card.description);
  const { make: tMake, model: tModel } = makeModelFromTitle(title);
  const make = brandHint ? makeFromSlug(brandHint) : tMake;
  const model = brandHint ? tModel : tModel;   // model é sempre best-effort do título

  // gearbox: não estruturado; tentamos texto livre (título+descrição). Cobertura baixa.
  const hay = `${title || ''} ${desc || ''}`;
  let gearbox = null;
  if (/\bautomatik\b|\bautomatic\b|\bdsg\b|\btiptronic\b/i.test(hay)) gearbox = 'Automatik';
  else if (/\bschaltgetriebe\b|\bhandschalt|\bmanuell\b|\d-?gang\b/i.test(hay)) gearbox = 'Schaltgetriebe';

  // engine: cilindrada (cm³) do JSON-LD (unitText "CMQ").
  const cc = ld?.vehicleEngine?.engineDisplacement?.value;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(make),
    model: cleanStr(model),
    variant: cleanStr(title),
    year: card.year ?? toInt(ld?.vehicleModelDate),
    km: card.km ?? null,
    fuel: cleanStr(card.fuel || ld?.fuelType),
    gearbox,
    engine: toInt(cc),
    color: null,                                  // não estruturado na listagem
    doors: null,                                  // não estruturado na listagem
    category: null,                               // subcategoria não exposta por card
    price: card.price ?? toInt(ld?.offers?.price),
    currency: 'EUR',
    country: 'GERMANY',
    region: cleanStr(decodeEntities(card.region)),  // Bundesland
    postalCode: null,                             // só cidade na listagem
    source: 'particular',                         // P2P; o card não nomeia o vendedor
    detail_url: cleanStr(card.detailUrl),
    image: cleanStr(card.image || ld?.image?.[0]?.contentUrl),
    collected_at: collectedAt,

    // --- extras próprios do quoka ---
    source_site: 'quoka.de',
    id: cleanStr(card.id),                         // hash de 32 chars (chave de dedupe/join)
    article_id: cleanStr(card.articleId),          // UUID interno
    city: cleanStr(decodeEntities(card.city)),
    price_old: card.priceOld ?? null,              // preço antes da descida (se houve)
    images: card.images ?? null,                   // nº de fotos
    listing_date: cleanStr(card.listingDate),      // recência ("heute HH:MM" / "DD Monat")
    premium: Boolean(card.premium),                // anúncio promovido
    verified_phone: Boolean(card.verifiedPhone),
    description: cleanStr(desc),
  };
}
