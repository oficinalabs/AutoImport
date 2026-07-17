/**
 * Índice em memória do catálogo ultimatespecs (us_models + us_versions),
 * construído por run a partir da BD. Dá ao resolver da Fase 2 quatro coisas:
 *
 *  1. Família canónica por mid, NO MESMO espaço do `normModel` dos anúncios
 *     (catálogo "G20-3-Series" → `serie-3` = normModel("320d") → `serie-3`).
 *     Reutilizamos `normModel` como canonicalizador: reduzimos o slug do catálogo
 *     a uma designação "estilo model_raw" e passamo-la pelas MESMAS regras dos
 *     anúncios — assim a convergência é automática para as marcas com regras.
 *  2. Janelas de geração por família (ano de arranque → janela encadeada).
 *  3. Fuel map por versão (reclassifica full-hybrid, que o catálogo mete em
 *     petrol/diesel — ver nota FUEL abaixo).
 *  4. Versões indexadas por (marca, família) com tokens do nome.
 *
 * Puro exceto `buildUsCatalog`, que lê a BD. A extração de família
 * (`resolveFamily`) e as janelas são funções puras, testáveis sem BD.
 *
 * NOTA FUEL (auditoria mild-hybrid): o catálogo NÃO tem secção `hybrid` —
 * `fuel_section` só é petrol/diesel/electric/pluginhybrid/other. Full-hybrids
 * (HEV) e mild-hybrids (MHEV) caem em petrol/diesel. A coluna deep `fuel`
 * ("Hybrid / Petrol", "Mild Petrol", "Plug-in Hybrid / Diesel", …) desambigua-os
 * e é a autoridade quando presente (97,5% de cobertura). Alinhamos com o
 * `normFuel` dos anúncios: MHEV mantém a base (gasolina/diesel), full-HEV → híbrido.
 * A secção `other` (bi-fuel LPG/CNG/etanol) é EXCLUÍDA do índice (o `normFuel`
 * também devolve null para GPL/GN).
 */
import type { db as Db } from "../../db";
import type { FuelType } from "../types";
import { normMake, normModel, slugify } from "./normalize-vehicle";

// ── Tipos do índice ──────────────────────────────────────────────

export interface CatalogVersion {
  versionId: string;
  mid: string;
  /** id da geração a que pertence (`${makeSlug}|${family}|${derivative||"base"}#${idx}`) */
  generationId: string;
  year: number | null;
  powerHp: number | null;
  powerKw: number | null;
  displacementCc: number | null;
  fuel: FuelType;
  co2Wltp: number | null;
  co2Nedc: number | null;
  /** tokens minúsculos do `name` (badges, litragem, potência, corpo, tração) */
  tokens: string[];
  doors: number | null;
  /** caixa pré-classificada via normGearbox (o texto deep é livre — "6 speed Manual") */
  gearbox: "manual" | "auto" | null;
  /** engine_code normalizado ([A-Z0-9]) para igualdade exata */
  engineCode: string | null;
}

export interface Generation {
  id: string;
  mids: string[];
  /** ano real de arranque (min model_year/versão); null se o mid não tem ano */
  startYear: number | null;
  /** janela inclusiva [yearStart, yearEnd]; yearEnd null = geração aberta */
  yearStart: number | null;
  yearEnd: number | null;
}

export interface CatalogFamily {
  makeSlug: string;
  family: string;
  generations: Generation[];
  versions: CatalogVersion[];
}

export interface UsCatalogIndex {
  /** chave `${makeSlug}|${family}` → família com gerações e versões */
  byFamily: Map<string, CatalogFamily>;
  /** mid → resolução (família + regra aplicada + geração + tokens do slug + derivado) */
  midInfo: Map<
    string,
    {
      makeSlug: string; family: string; rule: string; generationId: string; slugTokens: string[];
      /** tokens distintivos do mid dentro da sua família (ex. "gran-tourer"); "" = base */
      derivative: string;
    }
  >;
  stats: {
    mids: number;
    porRegra: number;
    porExcecao: number;
    ignorados: number;
    familias: number;
    geracoes: number;
    versoes: number;
    versoesExcluidasOther: number;
  };
}

// ── Linhas cruas da BD (só as colunas necessárias; specs NÃO é carregada) ──

export interface UsModelRow {
  mid: string;
  make: string;
  slug: string;
  modelYear: number | null;
}
export interface UsVersionRow {
  versionId: string;
  mid: string;
  name: string;
  fuelSection: string | null;
  fuel: string | null;
  year: number | null;
  powerHp: number | null;
  powerKw: number | null;
  displacementCc: number | null;
  co2Wltp: number | null;
  co2Nedc: number | null;
  doors: number | null;
  gearbox: string | null;
  engineCode: string | null;
}

// ════════════════════════════════════════════════════════════════
// 1. Extração de família
// ════════════════════════════════════════════════════════════════

/**
 * Slugs que a extração genérica não resolve (ou resolve mal) e cuja família é
 * fixada à mão. `null` = mid deliberadamente ignorado (fora do âmbito de
 * matching, ex. protótipos/concepts). Cada entrada tem de ser explicável.
 * É o único escape à regra: um mid ou resolve por regra, ou está aqui, ou o
 * build FALHA (garante que slugs novos desconhecidos são vistos por um humano).
 */
export const FAMILY_EXCEPTIONS: Record<string, string | null> = {
  // Mercedes sport-coupé W203 sem a palavra "Class" no slug → é um Classe C.
  "C-(W203)-Sportcoupe": "classe-c",
};

/** Tokens de corpo/porta a remover ao formar a chave de geração (genKey). */
export const BODY_TOKENS = new Set([
  "sedan", "saloon", "limousine", "berline", "coupe", "coup", "cabrio", "cabriolet",
  "convertible", "roadster", "spider", "spyder", "targa", "touring", "estate", "wagon",
  "sw", "cw", "station", "variant", "avant", "kombi", "hatchback", "hatch", "fastback",
  "sportback", "liftback", "notchback", "turismo", "gran", "tourer", "allroad", "alltrack",
  "van", "bus", "mixto", "shooting", "brake", "cab", "crew", "double", "single", "doors",
  "door", "long", "lwb", "swb", "maxi", "compact", "active", "sportswagon", "shuttle",
  "sportscoupe", "sportcoupe",
]);

/** Marcador de facelift a ignorar (LCI da BMW, Facelift, Restyling, Mopf). */
const FACELIFT_RE = /(^|-)(lci|facelift|restyling|mopf)(-|$)/g;

/** Marcas com códigos de chassis que escondem o modelo no slug. */
const CHASSIS_MAKES = new Set(["bmw", "mercedes"]);

// ── Mercedes: designadores procurados em QUALQUER posição do slug ──
// A ordem importa (sub-marcas antes das letras de classe). Cada família iguala
// o que o `normModel` devolveria para o anúncio equivalente (para convergir).
const MB_PATTERNS: [RegExp, string][] = [
  [/(^|-)maybach(-|$)/, "maybach"],
  [/(^|-)amg-gt(-|$)/, "amg-gt"],
  [/(^|-)cla(-|$)/, "cla"],
  [/(^|-)clb(-|$)/, "clb"],
  [/(^|-)cls(-|$)/, "cls"],
  [/(^|-)clk(-|$)/, "clk"],
  [/(^|-)clc(-|$)/, "clc"],
  [/(^|-)cle(-|$)/, "cle"],
  [/(^|-)gla(-|$)/, "gla"],
  [/(^|-)glb(-|$)/, "glb"],
  [/(^|-)glc(-|$)/, "glc"],
  [/(^|-)gle(-|$)/, "gle"],
  [/(^|-)gls(-|$)/, "gls"],
  [/(^|-)glk(-|$)/, "glk"],
  [/(^|-)gl(-|$)/, "gl"],
  [/(^|-)ml(-|$)/, "ml"],
  [/(^|-)slk(-|$)/, "slk"],
  [/(^|-)slc(-|$)/, "slc"],
  [/(^|-)slr(-|$)/, "slr"],
  [/(^|-)sls(-|$)/, "sls"],
  [/(^|-)sl(-|$)/, "sl"],
  [/(^|-)eqa(-|$)/, "eqa"],
  [/(^|-)eqb(-|$)/, "eqb"],
  [/(^|-)eqc(-|$)/, "eqc"],
  [/(^|-)eqe(-|$)/, "eqe"],
  [/(^|-)eqs(-|$)/, "eqs"],
  [/(^|-)eqv(-|$)/, "eqv"],
  [/(^|-)eqt(-|$)/, "eqt"],
  [/(^|-)citan(-|$)/, "citan"],
  [/(^|-)vito(-|$)/, "vito"],
  [/(^|-)viano(-|$)/, "viano"],
  [/(^|-)vaneo(-|$)/, "vaneo"],
  [/(^|-)sprinter(-|$)/, "sprinter"],
  [/(^|-)eurovan?(-|$)/, "eurovan"],
  [/(^|-)(x-class|class-x)(-|$)/, "x"],
];
// Letras de classe: A/B/C/E/S → classe-X; G/V/T/R → letra (igual ao fallback do normModel).
const MB_CLASS_LETTERS: [string, string][] = [
  ["a", "classe-a"], ["b", "classe-b"], ["c", "classe-c"], ["e", "classe-e"], ["s", "classe-s"],
  ["g", "g"], ["v", "v"], ["t", "t"], ["r", "r"],
];

function mercedesFamily(s: string): { family: string; rule: string } {
  for (const [re, fam] of MB_PATTERNS) if (re.test(s)) return { family: fam, rule: `mb:${fam}` };
  for (const [letter, fam] of MB_CLASS_LETTERS) {
    // "X-Class"/"Class-X" em qualquer posição, ou letra nua colada a um chassis W.
    const re = new RegExp(`(^|-)(${letter}-class|class-${letter})(-|$)|^${letter}-[wcsavxrhnz]\\d`);
    if (re.test(s)) return { family: fam, rule: `mb:class-${letter}` };
  }
  // Sem designador de modelo → clássico chassis-only (W123, W124, …). A família
  // é o próprio código de chassis (fica isolado; não colide com anúncios modernos).
  const chassis = s.split("-").find((t) => /^[a-z]\d{2,3}$/.test(t));
  if (chassis) return { family: chassis, rule: "mb:chassis-only" };
  return { family: s.split("-")[0], rule: "mb:fallback" };
}

// ── MINI: chassis que lideram o slug e não têm o nome do modelo ──
const MINI_CHASSIS: Record<string, string> = {
  r50: "mini-cooper", r53: "mini-cooper", r56: "mini-cooper", f55: "mini-cooper",
  f56: "mini-cooper", f66: "mini-cooper", j01: "mini-cooper",
  r60: "countryman", f60: "countryman", u25: "countryman",
  r55: "clubman", f54: "clubman",
  r52: "mini-cabrio", r57: "mini-cabrio", f57: "mini-cabrio", f67: "mini-cabrio",
};

/** Resolve a família de um mid. Lança se o slug for desconhecido (sem exceção). */
export function resolveFamily(
  makeRaw: string,
  rawSlug: string,
): { family: string | null; rule: string } {
  // Exceção explícita primeiro (inclui os deliberadamente ignorados = null).
  if (Object.hasOwn(FAMILY_EXCEPTIONS, rawSlug)) {
    const family = FAMILY_EXCEPTIONS[rawSlug];
    return { family, rule: family === null ? "exception:ignored" : "exception" };
  }

  const makeSlug = normMake(makeRaw);
  const s = slugify(rawSlug);
  if (!makeSlug || !s) throw new Error(`us-catalog: slug irresolúvel "${makeRaw}/${rawSlug}"`);

  if (makeSlug === "mercedes") return mercedesFamily(s);

  if (makeSlug === "mini") {
    const first = s.split("-").find((t) => MINI_CHASSIS[t]);
    if (first && (/^[rfju]\d/.test(s) || s.split("-")[0] === first)) {
      // slug lidera com chassis (F66-Hatch, J01-Hatch-Electric) → mapeia direto.
      if (/^[rfju]\d/.test(s.split("-")[0]) || /^j0\d/.test(s.split("-")[0]))
        return { family: MINI_CHASSIS[s.split("-")[0]] ?? MINI_CHASSIS[first], rule: "mini:chassis" };
    }
    const fam = normModel(makeSlug, s);
    if (fam) return { family: fam, rule: ruleTag(makeSlug, s, fam) };
  }

  let core = s;
  if (makeSlug === "bmw") {
    // Chassis à cabeça (E46-3-Series, G20-3-Series, E39-LCI-5-Series) esconde a
    // designação; removê-lo deixa "3-Series", que as regras BMW canonizam.
    core = core.replace(/^[efgu]\d{2,3}-(lci-)?/, "");
  } else if (makeSlug === "land-rover") {
    // Códigos de chassis à cabeça (L316-Defender-110, L663-Defender-90) escondem
    // o nome; removê-los deixa "Defender-110", que a regra land-rover canoniza.
    core = core.replace(/^l\d{3}-/, "");
  }
  if (makeSlug === "volkswagen" && /^t5\d?(-|$)|^t6\d?(-|$)|^t7(-|$)/.test(core)) {
    return { family: "transporter", rule: "vw:transporter" };
  }

  const fam = normModel(makeSlug, core);
  if (fam) return { family: fam, rule: ruleTag(makeSlug, core, fam) };

  throw new Error(`us-catalog: família irresolúvel "${makeRaw}/${rawSlug}"`);
}

/** Distingue no audit se o `normModel` casou uma regra de marca ou o fallback. */
function ruleTag(makeSlug: string, core: string, fam: string): string {
  const fallback = slugify(core).split("-")[0];
  return fam === fallback && makeSlug !== "mercedes" ? "normmodel:fallback" : "normmodel:rule";
}

// ════════════════════════════════════════════════════════════════
// 2. Chave e janelas de geração
// ════════════════════════════════════════════════════════════════

/**
 * genKey = stem que identifica a geração/chassis. Removemos parêntesis (já são
 * dashes após slugify), marcadores de facelift (LCI…) e tokens de corpo/porta —
 * assim as variantes de carroçaria do MESMO chassis fundem-se (E46 sedan/coupe/
 * touring → "e46-3-series"; Golf-7 + Golf-7-Variant → "golf-7"). Os códigos de
 * chassis distintos da MESMA geração (BMW E90/E91/E92/E93, F30/F31) ficam
 * separados aqui e fundem-se depois pela proximidade de ano (ver clusterGenerations).
 */
export function genKeyOf(rawSlug: string): string {
  let s = slugify(rawSlug).replace(FACELIFT_RE, "-");
  // remove "3-doors"/"5-door"/"3doors" antes de tokenizar
  s = s.replace(/\b\d-?doors?\b/g, "-");
  const tokens = s.split("-").filter((t) => t && !BODY_TOKENS.has(t));
  const key = tokens.join("-");
  return key || slugify(rawSlug);
}

/**
 * Agrupa genKeys (já com o ano de arranque) em gerações e calcula janelas.
 * Regras: ordenar por ano de arranque; começa nova geração quando o salto para
 * o arranque anterior é ≥2 anos (funde variantes de carroçaria multi-chassis da
 * mesma geração — ex. BMW E90/E91 2005 + E92 2006 + E93 2007 — e separa
 * gerações/faceliftes reais, ≥2 anos de intervalo, ex. Golf-2017→Golf-8). Janela
 * = [início, arranque_seguinte−1]; última aberta. O −1 de graça no `yearStart`
 * (apanha a matrícula no ano anterior ao model-year) só se aplica à PRIMEIRA
 * geração: nas seguintes, a geração anterior já cobre o ano N−1 (o seu `yearEnd`
 * é arranque−1), pelo que reaplicar o −1 criava uma sobreposição de 1 ano que
 * deixava um anúncio de fronteira (ex. Ateca 2019, X3 2023, T-Roc 2021) vazar
 * para a geração/facelift SEGUINTE. Sem o −1 interno as janelas ficam contíguas
 * e disjuntas. genKeys sem ano vão para o fim numa geração aberta [null, null].
 */
export function clusterGenerations(
  familyKey: string,
  genKeys: { genKey: string; mids: string[]; startYear: number | null }[],
): Generation[] {
  const dated = genKeys.filter((g) => g.startYear !== null).sort((a, b) =>
    a.startYear! - b.startYear! || a.genKey.localeCompare(b.genKey),
  );
  const undated = genKeys.filter((g) => g.startYear === null);

  // Cluster encadeado: junta ao cluster corrente enquanto o salto para o genKey
  // ANTERIOR for <2 anos (funde a cadeia E90→E91→E92→E93 da mesma geração, cujos
  // arranques distam 0-1 ano cada; separa gerações/faceliftes reais ≥2 anos).
  const clusters: { mids: string[]; startYear: number }[] = [];
  let prevStart = Number.NEGATIVE_INFINITY;
  for (const g of dated) {
    const last = clusters[clusters.length - 1];
    if (last && g.startYear! - prevStart < 2) {
      last.mids.push(...g.mids);
    } else {
      clusters.push({ mids: [...g.mids], startYear: g.startYear! });
    }
    prevStart = g.startYear!;
  }

  const gens: Generation[] = clusters.map((c, i) => {
    const next = clusters[i + 1];
    return {
      id: `${familyKey}#${i}`,
      mids: c.mids,
      startYear: c.startYear,
      yearStart: i === 0 ? c.startYear - 1 : c.startYear,
      yearEnd: next ? next.startYear - 1 : null,
    };
  });

  // genKeys sem ano → uma geração aberta no fim.
  if (undated.length) {
    gens.push({
      id: `${familyKey}#${gens.length}`,
      mids: undated.flatMap((g) => g.mids),
      startYear: null,
      yearStart: null,
      yearEnd: null,
    });
  }
  return gens;
}

// ════════════════════════════════════════════════════════════════
// 2b. Tokens distintivos por mid (derivados de modelo/carroçaria)
// ════════════════════════════════════════════════════════════════
// Partilhado pela guarda de derivados do resolver (match-version) e pelo build do
// índice: a MESMA lógica de ruído/núcleo/diferença. Vive aqui (e não em
// match-version) para evitar o ciclo — us-catalog não pode importar de match-version.

const ROMAN = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

/**
 * Carroçarias NEUTRAS (o corpo por omissão): não distinguem um derivado — o mid
 * que só difere por elas É o modelo base (o sedan/hatch é o Corolla/Série-3 base,
 * não um derivado). São tratadas como ruído ao calcular os tokens distintivos.
 */
export const NEUTRAL_BODY = new Set([
  "sedan", "saloon", "berline", "berlina", "limousine", "notchback", "hatchback",
  "hatch", "liftback", "fastback", "door", "doors",
]);

/**
 * Ruído ao comparar slugs de mids da MESMA família (não designa um derivado):
 * anos, romanos, códigos de chassis (e210/g20/l663), marcadores de facelift,
 * marcas de geração (mk5/mk6), carroçaria neutra e tokens de UMA letra (letras de
 * chassis/geração isoladas: Corsa D/E, Astra J/K — nunca um modelo por si só).
 */
export function isNoiseToken(t: string): boolean {
  if (/^(?:19|20)\d{2}$/.test(t)) return true; // ano
  if (ROMAN.has(t)) return true; // romano
  if (/^[a-z]{1,2}\d{1,3}[a-z]?$/.test(t)) return true; // chassis/plataforma letra-inicial (e210, g20, c8, mk5…)
  if (/^\d{1,3}[a-z]{1,2}$/.test(t)) return true; // chassis/plataforma dígito-inicial (8v, 8y, 8p — Audi/VW)
  if (/^(?:lci|facelift|restyling|mopf|phase)$/.test(t)) return true; // facelift/fase
  if (/^(?:class|klasse|classe|clase)$/.test(t)) return true; // filler do nome (Classe C)
  if (t.length === 1) return true; // letra/algarismo isolado (chassis/porta)
  if (NEUTRAL_BODY.has(t)) return true; // corpo por omissão → é a base
  return false;
}

/**
 * Tokens DISTINTIVOS por mid num universo de mids: os tokens de modelo/carroçaria
 * (slug menos ruído) que NÃO pertencem ao NÚCLEO comum a todos os mids do universo.
 * Determinístico, e preserva a ordem do slug (os Set mantêm a ordem de inserção —
 * daí "gran-coupe" e não "coupe-gran").
 *
 * O universo é do chamador — por isso os distintivos DIFEREM entre usos e está
 * certo: a guarda passa os mids DOS CANDIDATOS (núcleo local), o build passa TODOS
 * os mids da família (núcleo da família). Só a lógica ruído/núcleo/diferença é a
 * mesma; o núcleo é relativo ao universo recebido.
 */
export function distinctiveTokensByMid(
  slugTokensByMid: Map<string, string[]>,
): Map<string, Set<string>> {
  const modelTokens = new Map<string, Set<string>>();
  for (const [mid, toks] of slugTokensByMid) {
    modelTokens.set(mid, new Set(toks.filter((t) => !isNoiseToken(t))));
  }
  // núcleo comum a TODOS os mids do universo; os distintivos são o resto.
  let core: Set<string> | null = null;
  for (const s of modelTokens.values()) {
    if (core == null) {
      core = new Set(s);
    } else {
      const inter = new Set<string>();
      for (const t of core) if (s.has(t)) inter.add(t);
      core = inter;
    }
  }
  core ??= new Set<string>();
  const distinctive = new Map<string, Set<string>>();
  for (const [mid, s] of modelTokens) {
    distinctive.set(mid, new Set([...s].filter((t) => !core!.has(t))));
  }
  return distinctive;
}

// ════════════════════════════════════════════════════════════════
// 3. Fuel map e tokens
// ════════════════════════════════════════════════════════════════

/**
 * Combustível da versão alinhado com o `normFuel` dos anúncios. A coluna deep
 * `fuel` é a autoridade; sem ela cai-se na `fuel_section`. Secção `other`
 * (bi-fuel LPG/CNG/etanol) → null (excluída). Devolve null → versão fora do índice.
 */
export function resolveVersionFuel(fuelSection: string | null, deepFuel: string | null): FuelType | null {
  if (fuelSection === "other") return null; // bi-fuel/GPL/GN — fora do âmbito
  const f = deepFuel?.toLowerCase().trim() ?? "";
  if (f) {
    if (f.includes("plug-in") || f.includes("plug in")) return "phev";
    if (f.startsWith("mild")) return f.includes("diesel") ? "diesel" : "gasolina"; // MHEV mantém base
    if (f.includes("hybrid")) return "híbrido"; // full-HEV
    if (f.includes("electric")) return "elétrico";
    if (f.startsWith("petrol") || f.startsWith("gasolina")) return "gasolina";
    if (f.startsWith("diesel")) return "diesel";
    if (f.startsWith("lpg") || f.includes("cng")) return null;
  }
  switch (fuelSection) {
    case "petrol": return "gasolina";
    case "diesel": return "diesel";
    case "electric": return "elétrico";
    case "pluginhybrid": return "phev";
    default: return null;
  }
}

/** Tokens do nome da versão (badges/litragem/potência/corpo/tração), minúsculos. */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/**
 * Classifica a caixa em manual/auto a partir de texto livre (o catálogo tem
 * "6 speed Manual", anúncios têm "Schaltgetriebe", "DSG", "S-tronic", …).
 * Partilhada pelos dois lados (anúncio e catálogo) para classificarem igual.
 * A ORDEM dos ramos importa: semi/halbautomatik primeiro (semi-automática é
 * ambígua — nunca a classificamos; "halbautomatik" contém "autom" e viraria
 * auto); depois auto ANTES de manual, porque "automatic" contém "man" e cairia
 * no ramo manual se este viesse primeiro. Calibrada com o Passo 0 na BD real:
 * "AUTO" nu (107), "Handgeschakeld" NL (84, "schak"≠"schalt"), "Halbautomatik"
 * (18) e "Doppelkupplung" (4) eram mal/não classificados.
 */
export function normGearbox(text: string | null): "manual" | "auto" | null {
  const s = text?.toLowerCase().trim() ?? "";
  if (!s) return null;
  if (/semi|halbautom|sequen/.test(s)) return null;
  if (/(autom|dsg|s[- ]?tronic|steptronic|tiptronic|multitronic|powershift|dct|edc|pdk|cvt|automaat|automatique|doppelkupp|\bauto\b)/.test(s)) return "auto";
  if (/(man|schalt|schak|m[eé]c[aá]n)/.test(s)) return "manual";
  return null;
}

/** engine_code cru → normalizado ([A-Z0-9] uppercase) para igualdade exata; vazio → null. */
export function normEngineCode(text: string | null): string | null {
  const s = (text ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return s || null;
}

// ════════════════════════════════════════════════════════════════
// 4. Build do índice a partir das linhas da BD
// ════════════════════════════════════════════════════════════════

export function buildIndex(models: UsModelRow[], versions: UsVersionRow[]): UsCatalogIndex {
  // versões por mid + ano mínimo por mid (para o arranque das gerações)
  const versionsByMid = new Map<string, UsVersionRow[]>();
  const minYearByMid = new Map<string, number>();
  for (const v of versions) {
    (versionsByMid.get(v.mid) ?? versionsByMid.set(v.mid, []).get(v.mid)!).push(v);
    if (v.year != null) {
      const cur = minYearByMid.get(v.mid);
      if (cur == null || v.year < cur) minYearByMid.set(v.mid, v.year);
    }
  }

  const stats = {
    mids: models.length, porRegra: 0, porExcecao: 0, ignorados: 0,
    familias: 0, geracoes: 0, versoes: 0, versoesExcluidasOther: 0,
  };

  // mid → { makeSlug, family, rule, startYear, genKey, slugTokens }
  const midResolved = new Map<string, {
    makeSlug: string; family: string; rule: string; startYear: number | null; genKey: string;
    slugTokens: string[];
  }>();

  for (const m of models) {
    const { family, rule } = resolveFamily(m.make, m.slug);
    if (rule === "exception") stats.porExcecao++;
    else if (rule === "exception:ignored") { stats.ignorados++; continue; }
    else stats.porRegra++;
    if (family === null) { stats.ignorados++; continue; }

    const makeSlug = normMake(m.make)!;
    const minVer = minYearByMid.get(m.mid);
    const startYear =
      m.modelYear != null && minVer != null ? Math.min(m.modelYear, minVer)
      : (m.modelYear ?? minVer ?? null);
    midResolved.set(m.mid, {
      makeSlug, family, rule, startYear, genKey: genKeyOf(m.slug),
      // Tokens do slug do modelo — usados pela guarda anti-fallback do resolver
      // (Fase 2): "Grand i10"≠"Grand Santa Fe" apesar da mesma família `grand`.
      slugTokens: slugify(m.slug).split("-").filter(Boolean),
    });
  }

  // Agrupa mids por família e, dentro dela, por genKey.
  const familyMids = new Map<string, string[]>();
  for (const [mid, r] of midResolved) {
    const fk = `${r.makeSlug}|${r.family}`;
    (familyMids.get(fk) ?? familyMids.set(fk, []).get(fk)!).push(mid);
  }

  const byFamily = new Map<string, CatalogFamily>();
  const midInfo: UsCatalogIndex["midInfo"] = new Map();

  for (const [fk, mids] of familyMids) {
    const [makeSlug, family] = [midResolved.get(mids[0])!.makeSlug, midResolved.get(mids[0])!.family];

    // Derivado por mid: tokens distintivos sobre TODOS os mids da família (núcleo =
    // a família inteira). Calculado ANTES das gerações porque as gerações passam a ser
    // encadeadas POR LINHA DE DERIVADO (ver abaixo). O resolver recalcula-os por
    // CANDIDATOS — universos diferentes de propósito (ver distinctiveTokensByMid).
    const distinctiveByMid = distinctiveTokensByMid(
      new Map(mids.map((mid) => [mid, midResolved.get(mid)!.slugTokens])),
    );
    const derivativeOfMid = new Map<string, string>(
      mids.map((mid) => [mid, [...(distinctiveByMid.get(mid) ?? [])].join("-")]),
    );

    // Encadeia as gerações SEPARADAMENTE por linha de derivado. O clusterGenerations
    // fecha cada janela no arranque do cluster seguinte — correto DENTRO de uma linha
    // de carroçaria (Golf-7 2013 → Golf-8 2020), mas errado ENTRE derivados: sem esta
    // separação, a linha Gran-Tourer (F46 2015, F46-LCI 2018) era "fechada" em 2019
    // pela chegada do Gran-Coupe (F44 2020, OUTRA carroçaria e não o sucessor), e um GT
    // de 2022 caía fora da sua própria janela → só sobrava o Gran-Coupe e o match saía
    // na carroçaria errada. Por linha, cada carroçaria tem a sua sucessão e janelas.
    const midsByDerivative = new Map<string, string[]>();
    for (const mid of mids) {
      const d = derivativeOfMid.get(mid)!;
      (midsByDerivative.get(d) ?? midsByDerivative.set(d, []).get(d)!).push(mid);
    }

    const generations: Generation[] = [];
    // Ordena as linhas por chave de derivado para o id `#i` ser estável (a lista FLAT
    // é opaca aos consumidores, que iteram/procuram por id, nunca fazem parse dele).
    for (const derivative of [...midsByDerivative.keys()].sort()) {
      // genKey → mids + arranque (min dos arranques) DENTRO da linha de derivado.
      const byGenKey = new Map<string, { mids: string[]; startYear: number | null }>();
      for (const mid of midsByDerivative.get(derivative)!) {
        const r = midResolved.get(mid)!;
        const e = byGenKey.get(r.genKey) ?? { mids: [], startYear: null };
        e.mids.push(mid);
        if (r.startYear != null) e.startYear = e.startYear == null ? r.startYear : Math.min(e.startYear, r.startYear);
        byGenKey.set(r.genKey, e);
      }
      // id único na família: prefixado pela linha (`${fk}|${derivative||"base"}#i`).
      generations.push(
        ...clusterGenerations(
          `${fk}|${derivative || "base"}`,
          [...byGenKey.entries()].map(([genKey, v]) => ({ genKey, ...v })),
        ),
      );
    }

    // mid → generationId
    const genOfMid = new Map<string, string>();
    for (const g of generations) for (const mid of g.mids) genOfMid.set(mid, g.id);

    const famVersions: CatalogVersion[] = [];
    for (const mid of mids) {
      const generationId = genOfMid.get(mid)!;
      const r = midResolved.get(mid)!;
      const derivative = derivativeOfMid.get(mid)!;
      midInfo.set(mid, { makeSlug, family, rule: r.rule, generationId, slugTokens: r.slugTokens, derivative });
      for (const v of versionsByMid.get(mid) ?? []) {
        const fuel = resolveVersionFuel(v.fuelSection, v.fuel);
        if (fuel === null) { stats.versoesExcluidasOther++; continue; }
        famVersions.push({
          versionId: v.versionId, mid, generationId, year: v.year,
          powerHp: v.powerHp, powerKw: v.powerKw, displacementCc: v.displacementCc,
          fuel, co2Wltp: v.co2Wltp, co2Nedc: v.co2Nedc, tokens: nameTokens(v.name),
          doors: v.doors, gearbox: normGearbox(v.gearbox), engineCode: normEngineCode(v.engineCode),
        });
      }
    }
    stats.versoes += famVersions.length;
    stats.geracoes += generations.length;
    byFamily.set(fk, { makeSlug, family, generations, versions: famVersions });
  }
  stats.familias = byFamily.size;

  return { byFamily, midInfo, stats };
}

/** Carrega o catálogo da BD e constrói o índice. */
export async function buildUsCatalog(db: typeof Db): Promise<UsCatalogIndex> {
  const { sql } = await import("drizzle-orm");
  const models = (await db.execute(sql`
    select mid, make, slug, model_year as "modelYear" from us_models
  `)) as unknown as UsModelRow[];
  const versions = (await db.execute(sql`
    select version_id as "versionId", mid, name, fuel_section as "fuelSection", fuel,
           year, power_hp as "powerHp", power_kw as "powerKw",
           displacement_cc as "displacementCc", co2_wltp as "co2Wltp", co2_nedc as "co2Nedc",
           doors, gearbox, engine_code as "engineCode"
    from us_versions
  `)) as unknown as UsVersionRow[];
  return buildIndex(models, versions);
}
