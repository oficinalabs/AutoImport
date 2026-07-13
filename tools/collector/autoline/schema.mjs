// autoline/schema.mjs — schema-alvo comum + mapeamento do autoline.pt (marketplace Via Mobilis).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// CARD da listagem (fonte primária) + o `Product` do JSON-LD (enriquecimento, quando existe) no
// registo comum, estendido com os extras que o autoline oferece (leilão, ref, potência, norma Euro…).
//
// FONTE (ver parse.mjs): CARD sempre presente (make/ano/km/combustível/Euro/local/vendedor/imagem/
// URL/preço); Product do JSON-LD acrescenta preço numérico fiável, condição, carroçaria e potência
// (vem VAZIO nalgumas secções-país, ex. GB — daí o card ser a spine).
//
// NOTA sobre o stock: a categoria é CARROS (passenger cars / "Automóvel"), mas neste marketplace
// de comerciais entram ligeiros-comerciais leves (Sprinter/Transit/Master) misturados; e a secção
// Bélgica é quase toda de LEILÃO (Troostwijk/Auctim/AuctionPort…). Reportado honestamente em
// research/autoline-investigacao.md.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
export { CAMPOS, toInt, cleanStr };

// Nome do país (PT, como aparece no `location-text`/facet) → país normalizado EN em maiúsculas.
const PAIS_PT_EN = {
  'bélgica': 'BELGIUM', 'belgica': 'BELGIUM', 'alemanha': 'GERMANY', 'espanha': 'SPAIN',
  'frança': 'FRANCE', 'franca': 'FRANCE', 'grã-bretanha': 'UNITED KINGDOM', 'gra-bretanha': 'UNITED KINGDOM',
  'suíça': 'SWITZERLAND', 'suica': 'SWITZERLAND', 'portugal': 'PORTUGAL', 'holanda': 'NETHERLANDS',
  'países baixos': 'NETHERLANDS', 'itália': 'ITALY', 'italia': 'ITALY', 'polónia': 'POLAND',
  'polonia': 'POLAND', 'áustria': 'AUSTRIA', 'austria': 'AUSTRIA', 'lituânia': 'LITHUANIA',
};

// Código ISO do país (do filtro cnt{CC}) → país normalizado EN (autoritário quando há filtro).
const CC_EN = {
  BE: 'BELGIUM', DE: 'GERMANY', ES: 'SPAIN', FR: 'FRANCE', GB: 'UNITED KINGDOM', CH: 'SWITZERLAND',
  PT: 'PORTUGAL', NL: 'NETHERLANDS', IT: 'ITALY', PL: 'POLAND', AT: 'AUSTRIA', LT: 'LITHUANIA',
};

export function ccToCountry(cc) {
  return cc ? (CC_EN[String(cc).toUpperCase()] || String(cc).toUpperCase()) : null;
}

// Deriva {country, region} do `location-text` do card ("Bélgica, Lokeren"). Se `countryCode` (do
// filtro) vier, é autoritário para o país; region/cidade é sempre a parte após a vírgula.
function localDoCard(locText, countryCode) {
  let country = ccToCountry(countryCode);
  let region = null;
  const s = cleanStr(locText);
  if (s) {
    const [pais, ...resto] = s.split(',').map((x) => x.trim());
    if (!country && pais) country = PAIS_PT_EN[pais.toLowerCase()] || pais.toUpperCase();
    if (resto.length) region = resto.join(', ');
  }
  return { country, region };
}

// Ano ("2001-11" → {year:2001, month:11}). NÃO usar toInt (colaria os dígitos de mês).
function anoDaData(v) {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(v ?? ''));
  return m ? { year: Number(m[1]), month: m[2] ? Number(m[2]) : null } : { year: null, month: null };
}

// Descodifica o ID (data-code) num timestamp de criação: os 12 primeiros dígitos são YYMMDDHHMMSS
// (ex. "26071015164238004900" → 2026-07-10T15:16:42Z). Sinal de recência REAL — o robots proíbe
// `?sort=` (sem ordenação por data), mas o ID codifica a data de criação. null se não for plausível.
export function createdAtFromId(id) {
  const d = String(id ?? '');
  if (d.length < 12) return null;
  const mm = +d.slice(2, 4), dd = +d.slice(4, 6), HH = +d.slice(6, 8), MI = +d.slice(8, 10), SS = +d.slice(10, 12);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || HH > 23 || MI > 59 || SS > 59) return null;
  const iso = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}T${d.slice(6, 8)}:${d.slice(8, 10)}:${d.slice(10, 12)}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const propOf = (p, nome) => {
  const arr = p && Array.isArray(p.additionalProperty) ? p.additionalProperty : [];
  const hit = arr.find((x) => x && x.name === nome);
  return hit ? cleanStr(hit.value) : null;
};

// Preço numérico a partir do texto do card ("1 850 €"). null para "Leilão"/negociado/sem número.
function precoDoCard(txt) {
  const s = String(txt ?? '');
  if (!/\d/.test(s)) return null;               // "Leilão", "Preço sob consulta"…
  return toInt(s);
}

// --- mapeamento CARD (+ Product opcional) -> registo normalizado -------------
//
// Mapa (documentado para referência rápida):
//   card make (data-brand)                   -> make   (fallback: 1ª palavra do name)
//   card name sem make                       -> model
//   card name                                -> variant (título completo)
//   card ano                                 -> year
//   card quilometragem                       -> km
//   card Combustível  (fallback JSON-LD)     -> fuel
//   (não exposto na listagem)                -> gearbox/engine/color/doors = null
//   JSON-LD "Tipo de carroçaria"             -> category (carroçaria)
//   JSON-LD offers.price  (fallback card €)  -> price
//   JSON-LD offers.priceCurrency             -> currency (default EUR)
//   filtro cnt{CC} / location-text (país)     -> country
//   location-text (cidade)                   -> region
//   card vendedor (branding-company-name)     -> source (stand/leiloeiro)
//   card/JSON-LD url                         -> detail_url
//   card jpg (fallback JSON-LD image[0])     -> image
// Extras próprios: source_site, id (=data-code), dealer, is_auction, condition, ref_code,
//   power, axle_config, body_type, euro_norm, first_registration (MM/AAAA), created_at (do id).
//
// `p` (Product do JSON-LD) pode ser null. `collectedAt` e `countryCode` são injetados por quem chama.
export function normalizeCard(card, p = null, { collectedAt = null, countryCode = null } = {}) {
  const offer = (p && p.offers) || {};
  const name = cleanStr(card.name || p?.name);
  const make = cleanStr(card.make) || (name ? name.split(' ')[0] : null);
  let model = null;
  if (name) {
    model = make && name.toLowerCase().startsWith(make.toLowerCase())
      ? cleanStr(name.slice(make.length)) : cleanStr(name.split(' ').slice(1).join(' '));
  }
  const desc = p?.description || '';
  const { year, month } = anoDaData(card.year || (/Ano:\s*([\d-]+)/.exec(desc) || [])[1]);
  const km = card.km || (/Quilometragem:\s*([\d  .]+?)\s*km/.exec(desc) || [])[1];
  const ref = (/[✓·]\s*([A-Z]{2}\d{4,7})\s*[✓·]/.exec(desc) || [])[1] || null;
  const { country, region } = localDoCard(card.locText, countryCode);
  const img = card.image || (Array.isArray(p?.image) ? p.image[0] : p?.image);
  const price = toInt(offer.price) ?? precoDoCard(card.priceText);
  const id = card.id || (/--(\d+)(?:$|[?#])/.exec(card.detail_url || p?.url || '') || [])[1] || null;

  return {
    make,
    model,
    variant: name,
    year,
    km: toInt(km),
    fuel: cleanStr(card.fuel) || propOf(p, 'Combustível'),
    gearbox: null,                                   // não exposto na listagem
    engine: null,                                    // sem cilindrada na listagem
    color: null,                                     // não exposto
    doors: null,                                     // não exposto
    category: propOf(p, 'Tipo de carroçaria'),       // carroçaria (hatchback/sedan/SUV…), do JSON-LD
    price,
    currency: cleanStr(offer.priceCurrency) || 'EUR',
    country,
    region,
    postalCode: null,                                // não exposto na listagem
    source: cleanStr(card.company),                  // vendedor/stand/leiloeiro = fonte do anúncio
    detail_url: cleanStr(card.detail_url || p?.url || offer.url),
    image: cleanStr(img),
    collected_at: collectedAt,
    // --- extras próprios do autoline ---
    source_site: 'autoline.pt',
    id: id ? String(id) : null,
    dealer: cleanStr(card.company),
    is_auction: Boolean(card.auction) || /leil[ãa]o/i.test(desc),
    condition: cleanStr(offer.itemCondition ? String(offer.itemCondition).split('/').pop() : null),
    ref_code: ref,                                   // código interno do anúncio (ex. LE51585)
    power: propOf(p, 'Potência'),
    axle_config: propOf(p, 'Configuração do eixo'),
    body_type: propOf(p, 'Tipo de carroçaria'),
    euro_norm: cleanStr(card.euro),                  // norma de emissões (Euro 5/6…), do card
    first_registration: year ? `${month ? String(month).padStart(2, '0') : '??'}/${year}` : null,
    created_at: createdAtFromId(id),                 // recência REAL (id = timestamp de criação)
  };
}
