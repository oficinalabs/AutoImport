/**
 * Normalização determinística de veículos — a chave de matching entre
 * anúncios estrangeiros e o mercado PT.
 *
 *   norm_key = `${make}|${model}|${fuel}`  (unique em vehicle_models)
 *
 * Dimensões por anúncio (FORA da chave): year e km_band = floor(km/25000).
 * Puro e unit-tested; o dicionário cresce guiado pelo relatório de
 * não-mapeados do scripts/pipeline/match-models.ts (loop de qualidade).
 * Casos difíceis ficam para a normalização LLM (fase posterior, docs/03).
 */
import type { FuelType } from "../types";

/** slug ASCII: minúsculas, sem acentos, não-alfanum → '-'. */
export function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Marca ────────────────────────────────────────────────────────

const MAKE_ALIASES: Record<string, string> = {
  vw: "volkswagen",
  "mercedes-benz": "mercedes",
  "mercedes-amg": "mercedes",
  "citroen-ds": "citroen",
  "ds-automobiles": "ds",
  vauxhall: "opel",
  "landrover": "land-rover",
  "range-rover": "land-rover",
  "alfa": "alfa-romeo",
  "skoda-auto": "skoda",
  cupra: "cupra",
  "bmw-motorrad": "bmw-motorrad", // motos — fica separado da bmw de propósito
};

export function normMake(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const slug = slugify(raw);
  if (!slug) return null;
  return MAKE_ALIASES[slug] ?? slug;
}

// ── Modelo ───────────────────────────────────────────────────────
// Por marca: pares [regex sobre o SLUG do model_raw, canónico]. A primeira
// regra que casar ganha. Cobre as variações multi-língua dos sites
// DE/FR/NL/ES/PT (Serie 3 · Série 3 · 3er · 3-serie · 3 Series · 320d…).

type ModelRule = [RegExp, string];

const MODEL_RULES: Record<string, ModelRule[]> = {
  bmw: [
    [/^(?:serie-?|)([1-8])(?:er|-serie[s]?|-series|-reihe)?(?:$|-)/, "serie-$1"],
    [/^([1-8])\d{2}[a-z]{0,3}(?:$|-)/, "serie-$1"], // 320d, 118i, 530e…
    [/^(x[1-7]m?|z4|xm)(?:$|-)/, "$1"],
    [/^(i[3-8]|ix[1-3]?|m[2-8])(?:$|-)/, "$1"],
  ],
  mercedes: [
    [/^(?:classe-|class-|)([abces])(?:-klasse|-class|-classe)?(?:$|-)/, "classe-$1"],
    [/^([abces])-?\d{2,3}[a-z]*(?:$|-)/, "classe-$1"], // A 180, C220d, E300…
    [/^(?:classe-)?(cla|clb|cls|gla|glb|glc|gle|gls|slk|slc|sl|amg-gt|eq[abces]s?|citan|vito|classe-v)(?:$|-)/, "$1"],
  ],
  audi: [
    [/^(a[1-8]|q[2-8]|tt|r8|rs[3-7]|s[3-8])(?:$|-)/, "$1"],
    [/^(e-tron|q4-e-tron|q8-e-tron)(?:$|-)/, "$1"],
  ],
  volkswagen: [
    [/^t-?roc(?:$|-)/, "t-roc"],
    [/^t-?cross(?:$|-)/, "t-cross"],
    [/^(golf|polo|tiguan|passat|touran|touareg|arteon|sharan|caddy|up|scirocco|beetle|jetta)(?:$|-)/, "$1"],
    [/^id-?([3-7])(?:$|-)/, "id-$1"],
    [/^id-?buzz(?:$|-)/, "id-buzz"],
  ],
  peugeot: [
    [/^(\d{3,4})(?:$|-)/, "$1"], // 208, 2008, 308 SW → 308…
    [/^(partner|rifter|expert|traveller|boxer)(?:$|-)/, "$1"],
  ],
  renault: [
    [/^(clio|captur|megane|scenic|kadjar|austral|arkana|zoe|twingo|espace|talisman|kangoo|trafic|master|laguna)(?:$|-)/, "$1"],
    [/^(r?5|r?4)(?:$|-)/, "r$1"],
  ],
  toyota: [
    [/^yaris-cross(?:$|-)/, "yaris-cross"],
    [/^c-?hr(?:$|-)/, "c-hr"],
    [/^rav-?4(?:$|-)/, "rav-4"],
    [/^(yaris|corolla|aygo|auris|prius|camry|supra|hilux|proace|bz4x|land-cruiser)(?:$|-)/, "$1"],
  ],
  hyundai: [
    [/^(i[123]0|i40|kona|tucson|santa-fe|bayon|ioniq-?[56]?|staria|h-1)(?:$|-)/, "$1"],
  ],
  kia: [[/^(picanto|rio|ceed|xceed|stonic|niro|sportage|sorento|ev[3469]|soul|venga)(?:$|-)/, "$1"]],
  nissan: [
    [/^x-?trail(?:$|-)/, "x-trail"],
    [/^(micra|juke|qashqai|leaf|ariya|note|navara)(?:$|-)/, "$1"],
  ],
  ford: [
    [/^(fiesta|focus|puma|kuga|mondeo|ecosport|edge|mustang|ranger|transit|tourneo|s-max|galaxy)(?:$|-)/, "$1"],
  ],
  opel: [
    [/^(corsa|astra|mokka|crossland|grandland|insignia|adam|karl|zafira|combo|meriva)(?:$|-)/, "$1"],
  ],
  seat: [[/^(ibiza|leon|arona|ateca|tarraco|alhambra|mii|toledo)(?:$|-)/, "$1"]],
  cupra: [[/^(formentor|born|leon|ateca|tavascan|terramar)(?:$|-)/, "$1"]],
  skoda: [
    [/^(fabia|octavia|superb|kamiq|karoq|kodiaq|scala|enyaq|citigo|rapid|yeti)(?:$|-)/, "$1"],
  ],
  citroen: [
    [/^(c[1-5](?:-aircross|-x)?|berlingo|spacetourer|jumpy|jumper|ds[3-7]|e-c4|ami)(?:$|-)/, "$1"],
    [/^c4-cactus(?:$|-)/, "c4-cactus"],
  ],
  dacia: [[/^(sandero|duster|jogger|spring|logan|lodgy|dokker|bigster)(?:$|-)/, "$1"]],
  fiat: [[/^(500[clx]?|panda|tipo|punto|doblo|ducato|talento|600|topolino)(?:$|-)/, "$1"]],
  mini: [
    [/^(cooper|one|countryman|clubman|paceman|cabrio|hatch|aceman|electric)(?:$|-)/, "mini-$1"],
    [/^mini(?:$|-)/, "mini-cooper"],
  ],
  volvo: [
    [/^xc-?([469]0)(?:$|-)/, "xc$1"],
    [/^(v[469]0|s[469]0|ex[39]0|ec40|c40)(?:$|-)/, "$1"],
  ],
  tesla: [[/^model-([3sxy])(?:$|-)/, "model-$1"]],
  mazda: [[/^(2|3|6|cx-[3-9]0?|cx-[3-9]|mx-5|mx-30)(?:$|-)/, "$1"]],
  honda: [
    [/^hr-?v(?:$|-)/, "hr-v"],
    [/^cr-?v(?:$|-)/, "cr-v"],
    [/^zr-?v(?:$|-)/, "zr-v"],
    [/^(civic|jazz|e-ny1|accord)(?:$|-)/, "$1"],
  ],
  suzuki: [[/^(swift|vitara|s-cross|ignis|jimny|swace|across)(?:$|-)/, "$1"]],
  lexus: [[/^([lrnu]x|es|is|ct|gs|ls|lbx|rz)(?:$|-)/, "$1"]],
  byd: [
    [/^atto-?3(?:$|-)/, "atto-3"],
    [/^(dolphin|seal|han|tang|sealion)(?:$|-)/, "$1"],
  ],
  mg: [[/^(zs|hs|mg[3-5]|marvel-r|ehs|mg4)(?:$|-)/, "$1"]],
  porsche: [[/^(911|macan|cayenne|panamera|taycan|boxster|cayman|718)(?:$|-)/, "$1"]],
  "land-rover": [
    [/^(range-rover(?:-evoque|-sport|-velar)?|discovery(?:-sport)?|defender|freelander)(?:$|-)/, "$1"],
  ],
  jeep: [[/^(renegade|compass|avenger|wrangler|cherokee|grand-cherokee)(?:$|-)/, "$1"]],
  smart: [[/^(fortwo|forfour|1|3)(?:$|-)/, "smart-$1"]],
};

export function normModel(
  makeSlug: string | null,
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const slug = slugify(raw);
  if (!slug) return null;
  const rules = makeSlug ? MODEL_RULES[makeSlug] : undefined;
  if (rules) {
    for (const [re, canonical] of rules) {
      const m = re.exec(slug);
      if (m) return canonical.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
    }
  }
  // fallback: primeiro token do slug (ex.: "308-sw" → "308")
  return slug.split("-")[0] || null;
}

// ── Combustível ──────────────────────────────────────────────────
// Multi-língua (PT/DE/FR/NL/ES/EN). GPL/GN/hidrogénio → null (fora do
// âmbito de comparação; FuelType não os cobre). "Gas" sozinho é ambíguo → null.
//
// `variantRaw` desambigua HEV vs PHEV: muitos sites PT dizem só "Hibrido" no
// campo combustível e escondem o "Plug-in" na variante ("Allure Plug-in
// Hybrid 195cv") — sem isto, um HEV barato compara com o mercado PHEV e a
// poupança sai inflacionada (caso real: Peugeot 3008 Hybrid 145 vs PHEV 195).

export function normFuel(
  raw: string | null | undefined,
  variantRaw?: string | null,
): FuelType | null {
  if (!raw) return null;
  const s = slugify(raw);
  if (!s) return null;

  // plug-in primeiro (contém também "hybrid")
  if (/plug|phev/.test(s)) return "phev";
  // híbrido: hybrid/hibrido/hybride, ou padrão AS24 "elektro/benzin"
  const isHybrid =
    /hybrid|hibrid|hybride/.test(s) ||
    (/elektro|electr|eletr/.test(s) && /benzin|gasolina|diesel|essence|petrol/.test(s));
  if (isHybrid) {
    const v = variantRaw ? slugify(variantRaw) : "";
    return /plug-?in|phev/.test(v) ? "phev" : "híbrido";
  }
  if (/^(electr|elektr|eletr)/.test(s)) return "elétrico";
  if (/gasoleo|gazole|gasoil|gasolio|^diesel|^dizel/.test(s) || s === "d") return "diesel";
  if (/gasolina|benzin|essence|petrol|gasoline|benzina|^super$/.test(s)) return "gasolina";
  // GPL, LPG, CNG, "gas" ambíguo, hidrogénio, etc.
  return null;
}

// ── Chave e bandas ───────────────────────────────────────────────

export interface NormalizedVehicle {
  make: string;
  model: string;
  fuel: FuelType;
  normKey: string;
}

export function normalizeVehicle(
  makeRaw: string | null | undefined,
  modelRaw: string | null | undefined,
  fuelRaw: string | null | undefined,
  variantRaw?: string | null,
): NormalizedVehicle | null {
  const make = normMake(makeRaw);
  const model = normModel(make, modelRaw);
  const fuel = normFuel(fuelRaw, variantRaw);
  if (!make || !model || !fuel) return null;
  return { make, model, fuel, normKey: `${make}|${model}|${fuel}` };
}

/** Banda de quilometragem: 25.000 km por banda. */
export function kmBand(km: number): number {
  return Math.floor(km / 25000);
}
