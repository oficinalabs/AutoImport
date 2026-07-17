/**
 * Resolver determinístico anúncio → versão do catálogo ultimatespecs (Fase 2).
 *
 * `resolveVersion(input, catalog)` devolve a versão canónica (ou null) SEM tocar
 * na BD: o índice (`UsCatalogIndex`) vem injetado. Puro e determinístico —
 * mesmo input + mesmo catálogo ⇒ mesmo output byte-a-byte.
 *
 * Filosofia (docs/08): NUNCA adivinhar. Um `confirmado` é uma afirmação forte
 * (usa-se para restringir a amostra de mercado PT), por isso exige ≥2 sinais
 * duros do anúncio (potência, cilindrada, badge) que batem no catálogo E que os
 * candidatos sobreviventes concordem entre si. `provavel` é 1 sinal + candidato
 * único. Tudo o resto → null (sem sinais duros nunca há match, mesmo com um só
 * candidato). A cascata e as tolerâncias vêm do plano "matching perfeito".
 */
import { parsePowerFromText } from "../../tools/collector/lib/db-sink";
import type { FuelType } from "../types";
import { normFuel, normMake, normModel, normModelViaRule, slugify } from "./normalize-vehicle";
import { BODY_TOKENS, type CatalogVersion, type Generation, type UsCatalogIndex } from "./us-catalog";

export interface ResolveInput {
  makeRaw: string;
  modelRaw: string;
  variant: string | null;
  fuelRaw: string | null;
  year: number | null;
  powerHp: number | null;
  displacementCc: number | null;
  co2: number | null;
}

export type MatchConfidence = "confirmado" | "provavel";

export interface MatchEvidence {
  /** chave de família usada (`make|família`) */
  family: string;
  fuel: FuelType;
  /** sinais duros PRESENTES no anúncio E batidos no catálogo */
  signals: {
    powerHp?: number;
    displacementCc?: number;
    displacementL?: number;
    /** capacidade da bateria (kWh) batida no catálogo — 2.º sinal dos elétricos */
    kwh?: number;
    badges?: string[];
  };
  /** nº de tipos de sinal duro batidos (potência/cilindrada/badge) */
  hardSignals: number;
  /** nº de versões sobreviventes a todos os filtros */
  candidates: number;
  /** vários trims com a mesma assinatura (potência/cilindrada) */
  trimAmbiguo: boolean;
  /** sobreviventes em gerações distintas mas com specs concordantes */
  geracaoAmbigua: boolean;
  /** sobreviventes em derivados de modelo/carroçaria distintos sem base clara e
   * sem token desambiguador no anúncio (Corolla Cross/TS, Defender 90/110…) */
  derivadoAmbiguo: boolean;
  /** a família veio do fallback primeiro-token do normModel (ex. "Grand …") */
  viaFallback: boolean;
}

export interface MatchResult {
  versionId: string;
  /** mid da geração; null quando `geracaoAmbigua` e o ano cabe em várias gerações */
  mid: string | null;
  confidence: MatchConfidence;
  evidence: MatchEvidence;
}

// ── Tolerâncias (plano) ──────────────────────────────────────────
/** |Δcv| aceite entre anúncio e versão (facelifts/afinações da mesma designação). */
const powerTol = (hp: number) => Math.max(7, Math.round(hp * 0.04));
/** cilindrada cc↔cc: ±30 cm³. */
const CC_TOL = 30;
/** kWh anúncio↔catálogo: ±2. O catálogo arredonda o kWh do nome (57.7→58, 44.9→45)
 * para `displacementCc`; o anúncio pode trazer o nominal/utilizável e outra casa
 * decimal. ±2 absorve o arredondamento e o desvio nominal/utilizável sem juntar
 * capacidades distintas (degraus de bateria distam tipicamente ≥5 kWh). */
const KWH_TOL = 2;
// Concordância entre candidatos: mesmo cc (±50) e mesmo CO₂ da norma. O plano
// pedia CO₂ ±10, mas a auditoria mostra que UMA designação (ex. 840i 333cv
// 2998cc) varia ~17 g WLTP entre carroçarias/tração/facelift (cabrio vs coupé,
// RWD vs xDrive) e ~17 g NEDC (Cooper S manual vs auto). A potência (±max(7,4%))
// e a cilindrada (±50) são o verdadeiro guarda de designação; o CO₂ é só um
// backstop contra outliers grosseiros (>30 g = carro diferente).
const CC_CONCORD = 50;
const CO2_CONCORD = 30;

/** cm³ → litros com 1 casa decimal (1968 → 2.0), para o match litragem↔cc. */
const litersOfCc = (cc: number) => Math.round(cc / 100) / 10;

// ── Sinais do anúncio ────────────────────────────────────────────

/**
 * Badges "fortes" (inequívocos) da variante+modelo: tokens que misturam letra e
 * dígito ("320d", "xdrive40", "530e", "edrive20") — designadores específicos de
 * motorização/trim. Também juntamos pares adjacentes alfa+dígito ("xDrive 45" →
 * "xdrive45") porque algumas fontes separam com espaço. Tokens só-alfa ("gti",
 * "tdi") ou só-número ("245", "2.0") NÃO são badges fortes: a potência/cilindrada
 * tratam desses. Normalizados como os tokens do `name` da versão (nameTokens).
 */
function strongBadges(modelRaw: string, variant: string | null): string[] {
  const text = `${modelRaw} ${variant ?? ""}`;
  const tokens = slugify(text)
    .split("-")
    .filter(Boolean);
  const badges = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const hasLetter = /[a-z]/.test(t);
    const hasDigit = /\d/.test(t);
    if (hasLetter && hasDigit) badges.add(t);
    // Badge BMW com letra de caixa colada ("840iA"→"840ia", "320dA"→"320da"): o
    // catálogo nomeia sem o "a" ("840i"/"320d"). Acrescenta a forma sem sufixo (só
    // no padrão \d{3}[id]a — não toca em "M340i", que começa por letra).
    const noGearbox = /^(\d{3}[id])a$/.exec(t);
    if (noGearbox) badges.add(noGearbox[1]);
    // par alfa + dígito adjacentes → concatenação ("xdrive" + "45" → "xdrive45")
    const next = tokens[i + 1];
    if (next && /^[a-z]+$/.test(t) && /^\d+$/.test(next)) badges.add(t + next);
  }
  return [...badges];
}

/**
 * Litragem da variante: "2.0"/"1,6" → litros (1 casa). Apanha a letra colada
 * ("1.6d", "2.0T") via lookahead `(?![\d.,])` em vez de `\b` (que falharia entre
 * dígito e letra). Não apanha falsos: "R1250" (sem separador → null), "1.5"
 * dentro de números maiores ("1.55"/"1500" → o dígito seguinte veta). Ignora
 * números soltos sem separador.
 */
export function litersFromVariant(variant: string | null): number | null {
  if (!variant) return null;
  const m = /\b([1-9])[.,](\d)(?![\d.,])/.exec(variant);
  return m ? Number(m[1]) + Number(m[2]) / 10 : null;
}

/**
 * kWh da bateria na variante: "58 kWh"/"50kWh"/"80.8kWh"/"54,2 kWh" → número.
 * Exige o "h" de kWh (o `[^-a-z]` a seguir veta a POTÊNCIA "150 kW" — kW≠kWh).
 * Tolerante a decimais (. ou ,) e espaço. Usado como 2.º sinal duro nos elétricos
 * (o catálogo guarda a capacidade arredondada no `displacementCc` das versões EV).
 */
export function kwhFromVariant(variant: string | null): number | null {
  if (!variant) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*kwh\b/i.exec(variant);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** Potência efetiva: a estruturada do anúncio, senão extraída do texto. */
function effectivePower(input: ResolveInput): number | null {
  if (input.powerHp != null) return input.powerHp;
  const text = [input.variant, input.modelRaw].filter(Boolean).join(" ");
  return text ? parsePowerFromText(text) : null;
}

// ── Família do anúncio ───────────────────────────────────────────

/**
 * Família candidata + proveniência. Trata os trims de performance BMW escritos
 * como modelo ("M850i", "M340i") — o dígito a seguir ao M é a série (catálogo
 * mete-os em serie-N, não em m8/m3, esses são os M puros "M3"/"M8"). Fora disso
 * usa o `normModel` dos anúncios. `viaFallback` = a família saiu do fallback
 * primeiro-token (ativa a guarda de tokens do modelo no `provavel`).
 */
function resolveAdFamily(
  makeSlug: string,
  modelRaw: string,
  variant: string | null,
): { family: string; viaFallback: boolean } | null {
  if (makeSlug === "bmw") {
    const m = /^m([2-8])\d{2}/.exec(slugify(modelRaw));
    if (m) return { family: `serie-${m[1]}`, viaFallback: false };
  }
  const family = normModel(makeSlug, modelRaw, variant);
  if (!family) return null;
  return { family, viaFallback: !normModelViaRule(makeSlug, modelRaw, variant) };
}

// ── Geração ──────────────────────────────────────────────────────

/** Janela [yearStart, yearEnd] contém year? Gerações sem datas são sempre incluídas. */
function genWindowContains(g: Generation, year: number | null): boolean {
  if (year == null) return true;
  if (g.yearStart == null && g.yearEnd == null) return true; // indatada: incluir
  return (g.yearStart == null || year >= g.yearStart) && (g.yearEnd == null || year <= g.yearEnd);
}

/** Geração DATADA cuja janela contém year (indatadas não contam para fixar a geração). */
function genDatedContains(g: Generation, year: number): boolean {
  return g.yearStart != null && year >= g.yearStart && (g.yearEnd == null || year <= g.yearEnd);
}

// ── Concordância entre candidatos ────────────────────────────────

/** Amplitude (max-min) dos valores não-nulos; null se <2 valores. */
function spread(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length < 2) return null;
  return Math.max(...xs) - Math.min(...xs);
}

/**
 * CO₂ da norma do ano (≥2019 WLTP, ≤2018 NEDC; ver docs/08). Sem fallback entre
 * normas: NEDC é sistematicamente menor que WLTP, e comparar candidatos em normas
 * diferentes daria falsa discordância. Ano ausente → WLTP (norma moderna).
 */
function normCo2(v: CatalogVersion, year: number | null): number | null {
  return year != null && year <= 2018 ? v.co2Nedc : v.co2Wltp;
}

/** Candidatos concordam: mesma cilindrada, mesma potência (degrau), mesmo CO₂. */
function concordant(vs: CatalogVersion[], year: number | null): boolean {
  if (vs.length < 2) return true;
  const ccS = spread(vs.map((v) => v.displacementCc));
  if (ccS != null && ccS > CC_CONCORD) return false;
  const powers = vs.map((v) => v.powerHp).filter((p): p is number => p != null);
  if (powers.length >= 2) {
    const min = Math.min(...powers);
    if (Math.max(...powers) - min > powerTol(min)) return false;
  }
  const co2S = spread(vs.map((v) => normCo2(v, year)));
  if (co2S != null && co2S > CO2_CONCORD) return false;
  return true;
}

/** Ordenação determinística: menor version_id (numérico). */
const byVersionId = (a: CatalogVersion, b: CatalogVersion) =>
  a.versionId.localeCompare(b.versionId, undefined, { numeric: true });

// ── Guarda de derivados de modelo/carroçaria ─────────────────────

const ROMAN = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

/**
 * Carroçarias NEUTRAS (o corpo por omissão): não distinguem um derivado — o mid
 * que só difere por elas É o modelo base (o sedan/hatch é o Corolla/Série-3 base,
 * não um derivado). São tratadas como ruído ao calcular os tokens distintivos.
 */
const NEUTRAL_BODY = new Set([
  "sedan", "saloon", "berline", "berlina", "limousine", "notchback", "hatchback",
  "hatch", "liftback", "fastback", "door", "doors",
]);

/**
 * Carroçarias ESPECIAIS + GT: distinguem um corpo real (cabrio/coupé/break/GT…).
 * Ficam como distintivos, mas quando não há base inequívoca partilham motor/cc e
 * o preço PT é por modelo (não por corpo), por isso NÃO demovem — só trimAmbiguo
 * (ex. Série 8 coupé/cabrio/gran-coupé, TT coupé/roadster).
 */
const SPECIAL_BODY = new Set(
  [...BODY_TOKENS, "gt", "gtc", "sports", "sportstourer"].filter((t) => !NEUTRAL_BODY.has(t)),
);

/**
 * Ruído ao comparar slugs de mids da MESMA família (não designa um derivado):
 * anos, romanos, códigos de chassis (e210/g20/l663), marcadores de facelift,
 * marcas de geração (mk5/mk6), carroçaria neutra e tokens de UMA letra (letras de
 * chassis/geração isoladas: Corsa D/E, Astra J/K — nunca um modelo por si só).
 */
function isNoiseToken(t: string): boolean {
  if (/^(?:19|20)\d{2}$/.test(t)) return true; // ano
  if (ROMAN.has(t)) return true; // romano
  if (/^[a-z]{1,2}\d{1,3}[a-z]?$/.test(t)) return true; // chassis/plataforma (e210, g20, c8, mk5…)
  if (/^(?:lci|facelift|restyling|mopf|phase)$/.test(t)) return true; // facelift/fase
  if (/^(?:class|klasse|classe|clase)$/.test(t)) return true; // filler do nome (Classe C)
  if (t.length === 1) return true; // letra/algarismo isolado (chassis/porta)
  if (NEUTRAL_BODY.has(t)) return true; // corpo por omissão → é a base
  return false;
}

/**
 * Guarda de derivados: quando os candidatos sobreviventes abrangem mids cujos
 * slugs diferem em TOKENS DISTINTIVOS de modelo/carroçaria (cross, cabrio,
 * 90/110 do Defender, cargo/life das carrinhas…), desambigua pelo texto:
 *  (i)   o texto nomeia um derivado → só esse grupo sobrevive;
 *  (ii)  não nomeia nenhum mas há mid(s) BASE (só carroçaria neutra) → o base
 *        (Corolla hatch, Série-3 sedan, T-Roc SUV);
 *  (iii) sem base: se os distintivos forem SÓ carroçaria especial (coupé/cabrio)
 *        fica trimAmbiguo (partilham motor/cc); senão é `derivadoAmbiguo`
 *        (Defender 90/110, Combo cargo/life) → o consumidor demove a provável.
 * Os tokens distintivos vêm da diferença dos slugs (menos ruído) — determinístico.
 */
function derivativeGuard(
  cands: CatalogVersion[],
  adTokens: Set<string>,
  midInfo: UsCatalogIndex["midInfo"],
): { cands: CatalogVersion[]; derivadoAmbiguo: boolean } {
  const mids = [...new Set(cands.map((v) => v.mid))];
  if (mids.length < 2) return { cands, derivadoAmbiguo: false };

  const modelTokens = new Map<string, Set<string>>();
  for (const mid of mids) {
    modelTokens.set(mid, new Set((midInfo.get(mid)?.slugTokens ?? []).filter((t) => !isNoiseToken(t))));
  }
  // núcleo comum a TODOS os mids (a família); os distintivos são o resto.
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
  const universe = new Set<string>();
  for (const mid of mids) {
    const d = new Set([...modelTokens.get(mid)!].filter((t) => !core!.has(t)));
    distinctive.set(mid, d);
    for (const t of d) universe.add(t);
  }
  if (universe.size === 0) return { cands, derivadoAmbiguo: false }; // sem derivados reais

  // (i) o anúncio nomeia algum derivado → fica só quem o anúncio nomeia.
  const named = [...universe].some((t) => adTokens.has(t));
  if (named) {
    const keep = new Set(mids.filter((mid) => [...distinctive.get(mid)!].some((t) => adTokens.has(t))));
    const filtered = cands.filter((v) => keep.has(v.mid));
    return { cands: filtered.length ? filtered : cands, derivadoAmbiguo: false };
  }
  // (ii) sem token no anúncio mas há base (só carroçaria neutra) → o(s) base.
  const baseMids = new Set(mids.filter((mid) => distinctive.get(mid)!.size === 0));
  if (baseMids.size) {
    return { cands: cands.filter((v) => baseMids.has(v.mid)), derivadoAmbiguo: false };
  }
  // (iii) sem base: só carroçaria especial → trimAmbiguo; senão derivadoAmbiguo.
  if ([...universe].every((t) => SPECIAL_BODY.has(t))) return { cands, derivadoAmbiguo: false };
  return { cands, derivadoAmbiguo: true };
}

// ════════════════════════════════════════════════════════════════
// Resolver
// ════════════════════════════════════════════════════════════════

export function resolveVersion(input: ResolveInput, catalog: UsCatalogIndex): MatchResult | null {
  const makeSlug = normMake(input.makeRaw);
  if (!makeSlug) return null;

  // Fuel é obrigatório e exato: GPL/GN/"gas" → null (fora do âmbito); elétrico
  // nunca casa térmico; HEV≠PHEV. O catálogo já normaliza MHEV→base, por isso a
  // ponte gasolina/diesel↔MHEV é igualdade direta.
  const fuel = normFuel(input.fuelRaw, input.variant, input.co2);
  if (!fuel) return null;

  const fam = resolveAdFamily(makeSlug, input.modelRaw, input.variant);
  if (!fam) return null;

  // Lookup da família; se a chave (com variante) não existir, tenta sem variante.
  let familyKey = `${makeSlug}|${fam.family}`;
  let family = catalog.byFamily.get(familyKey);
  if (!family) {
    const alt = normModel(makeSlug, input.modelRaw);
    if (alt && alt !== fam.family) {
      const altKey = `${makeSlug}|${alt}`;
      const altFam = catalog.byFamily.get(altKey);
      if (altFam) {
        family = altFam;
        familyKey = altKey;
        fam.viaFallback = !normModelViaRule(makeSlug, input.modelRaw);
      }
    }
  }
  if (!family) return null;

  const genById = new Map(family.generations.map((g) => [g.id, g]));

  // Candidatos: fuel exato + janela de geração contém year.
  let cands = family.versions.filter(
    (v) => v.fuel === fuel && genWindowContains(genById.get(v.generationId)!, input.year),
  );
  if (!cands.length) return null;

  // ── Sinais duros e filtragem ──
  const powerAd = effectivePower(input);
  const litersAd = litersFromVariant(input.variant);
  const kwhAd = fuel === "elétrico" ? kwhFromVariant(input.variant) : null;
  // Refinamento Fase 3: um badge igual ao slug da família é o NOME DO MODELO
  // repetido (Volvo "V50" → badge "v50" == família "v50"), não uma designação de
  // trim/motor — removê-lo para não contar como sinal duro nem filtrar.
  const familySlug = familyKey.slice(makeSlug.length + 1);
  const badges = strongBadges(input.modelRaw, input.variant).filter((b) => b !== familySlug);

  const signals: MatchEvidence["signals"] = {};
  let hardSignals = 0;

  // Potência: exclui versões sem potência conhecida (sem dado não há prova).
  if (powerAd != null) {
    const tol = powerTol(powerAd);
    const filtered = cands.filter((v) => v.powerHp != null && Math.abs(v.powerHp - powerAd) <= tol);
    if (!filtered.length) return null; // potência presente mas nenhuma versão bate
    cands = filtered;
    signals.powerHp = powerAd;
    hardSignals++;
  }

  // kWh da bateria (elétricos): 2.º sinal duro. O `displacementCc` do catálogo é a
  // capacidade arredondada da versão EV; casa com o kWh da variante (±2). Só conta
  // quando ALGUM candidato COM cc bate (senão é ruído). Candidatos com cc null NÃO
  // podem ser eliminados por mismatch (o catálogo não tem o valor) — sobrevivem.
  if (kwhAd != null) {
    const matches = (v: CatalogVersion) =>
      v.displacementCc != null && Math.abs(v.displacementCc - kwhAd) <= KWH_TOL;
    if (cands.some(matches)) {
      cands = cands.filter((v) => v.displacementCc == null || matches(v));
      signals.kwh = kwhAd;
      hardSignals++;
    }
  }

  // Cilindrada: cc↔cc (±30) ou litragem↔cc (igualdade a 1 casa). Ignorada em
  // elétricos (o `displacement_cc` do catálogo guarda o kWh da bateria — ruído).
  if (fuel !== "elétrico") {
    if (input.displacementCc != null) {
      const filtered = cands.filter(
        (v) => v.displacementCc != null && Math.abs(v.displacementCc - input.displacementCc!) <= CC_TOL,
      );
      if (!filtered.length) return null;
      cands = filtered;
      signals.displacementCc = input.displacementCc;
      hardSignals++;
    } else if (litersAd != null) {
      const filtered = cands.filter((v) => v.displacementCc != null && litersOfCc(v.displacementCc) === litersAd);
      if (!filtered.length) return null;
      cands = filtered;
      signals.displacementL = litersAd;
      hardSignals++;
    }
  }

  // Badge forte (alfanumérico): só conta se ALGUM candidato o contém (senão é
  // ruído, não filtra — evita descartar tudo por um selo que o catálogo não
  // nomeia). Conta como sinal duro (o principal 2.º sinal dos elétricos).
  if (badges.length) {
    const filtered = cands.filter((v) => badges.some((b) => v.tokens.includes(b)));
    if (filtered.length) {
      cands = filtered;
      signals.badges = badges.filter((b) => cands.some((v) => v.tokens.includes(b)));
      hardSignals++;
    }
  }

  const trimTokens = slugify(`${input.modelRaw} ${input.variant ?? ""}`).split("-").filter(Boolean);
  const adTokens = new Set(trimTokens);

  // Guarda de derivados de modelo/carroçaria: separa derivados distintos (Cross,
  // Cabrio, Defender 90/110) pelo texto do anúncio ou, na ausência de token,
  // recolhe o modelo base; sem base inequívoca marca `derivadoAmbiguo`.
  const guard = derivativeGuard(cands, adTokens, catalog.midInfo);
  cands = guard.cands;
  const derivadoAmbiguo = guard.derivadoAmbiguo;

  // Desempate de trim: estreita por qualquer token do modelo+variante que PARTA
  // os candidatos (uns têm-no, outros não). NÃO conta como sinal duro — a
  // potência e a cilindrada já garantem a designação; isto só separa trims
  // gémeos de igual potência/cc (Golf R vs GTI Clubsport, M8 vs M8 Competition).
  // É seguro para a precisão: todo o sobrevivente já bateu potência/cc do anúncio.
  for (const t of trimTokens) {
    const withT = cands.filter((v) => v.tokens.includes(t));
    if (withT.length && withT.length < cands.length) cands = withT;
  }

  // Preferência de degrau exato: entre os sobreviventes fica o(s) de potência
  // mais próxima da do anúncio. Separa o degrau/geração certa quando duas
  // designações coexistem dentro da tolerância (X3 190 vs 197; 928 S4 320 vs GT
  // 330) SEM relaxar a tolerância — só desempata pelo que bate exato.
  if (powerAd != null) {
    const withP = cands.filter((v) => v.powerHp != null);
    if (withP.length) {
      const best = Math.min(...withP.map((v) => Math.abs(v.powerHp! - powerAd)));
      cands = cands.filter((v) => v.powerHp != null && Math.abs(v.powerHp - powerAd) === best);
    }
  }

  if (!cands.length) return null;

  // ── Escolha e flags ──
  const gens = new Set(cands.map((v) => v.generationId));
  const geracaoAmbigua = gens.size > 1;
  const distinctVersions = new Set(cands.map((v) => v.versionId)).size;

  // Gerações datadas que contêm o ano (para fixar a geração devolvida).
  const datedGens =
    input.year != null
      ? new Set(cands.filter((v) => genDatedContains(genById.get(v.generationId)!, input.year!)).map((v) => v.generationId))
      : new Set<string>();

  // Escolha determinística: preferir sobreviventes numa geração datada que
  // contém o ano (garante o invariante ano∈janela); senão qualquer. Menor id.
  const pool = datedGens.size
    ? cands.filter((v) => datedGens.has(v.generationId))
    : cands;
  const chosen = [...pool].sort(byVersionId)[0];

  // mid: null quando não conseguimos fixar a geração (ano em ≥2 gerações datadas,
  // ou ano ausente/indatado) — o consumidor desliga a guarda de geração.
  const mid = geracaoAmbigua && datedGens.size !== 1 ? null : chosen.mid;

  const evidence: MatchEvidence = {
    family: familyKey,
    fuel,
    signals,
    hardSignals,
    candidates: cands.length,
    trimAmbiguo: distinctVersions > 1,
    geracaoAmbigua,
    derivadoAmbiguo,
    viaFallback: fam.viaFallback,
  };

  // Guarda anti-fallback (obrigatória): quando a família veio do fallback
  // primeiro-token, os tokens do model_raw têm de estar contidos nos tokens do
  // slug do candidato (evita "Grand i10" → "Grand Santa Fe").
  if (fam.viaFallback) {
    const adTokens = slugify(input.modelRaw).split("-").filter(Boolean);
    const slugTokens = catalog.midInfo.get(chosen.mid)?.slugTokens ?? [];
    const contained = adTokens.every((t) => slugTokens.includes(t));
    if (!contained) return null;
  }

  // ── Decisão ──
  // confirmado: ≥2 sinais duros, candidatos concordantes e ANO presente (sem ano
  // não há prova de geração). Downgrade a provavel se faltar o ano OU se os
  // derivados de modelo ficaram ambíguos (não sabemos QUAL carroçaria/derivado).
  if (hardSignals >= 2 && concordant(cands, input.year)) {
    const confirmable = input.year != null && !derivadoAmbiguo;
    return { versionId: chosen.versionId, mid, confidence: confirmable ? "confirmado" : "provavel", evidence };
  }
  // provavel: ≥1 sinal duro e candidato único.
  if (hardSignals >= 1 && distinctVersions === 1) {
    return { versionId: chosen.versionId, mid, confidence: "provavel", evidence };
  }
  // Resto → null (0 sinais duros nunca casa, mesmo com candidato único).
  return null;
}
