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
import type { CatalogVersion, Generation, UsCatalogIndex } from "./us-catalog";

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

  // Desempate de trim: estreita por qualquer token do modelo+variante que PARTA
  // os candidatos (uns têm-no, outros não). NÃO conta como sinal duro — a
  // potência e a cilindrada já garantem a designação; isto só separa trims
  // gémeos de igual potência/cc (Golf R vs GTI Clubsport, M8 vs M8 Competition).
  // É seguro para a precisão: todo o sobrevivente já bateu potência/cc do anúncio.
  const trimTokens = slugify(`${input.modelRaw} ${input.variant ?? ""}`).split("-").filter(Boolean);
  for (const t of trimTokens) {
    const withT = cands.filter((v) => v.tokens.includes(t));
    if (withT.length && withT.length < cands.length) cands = withT;
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
  // não há prova de geração). Downgrade a provavel se faltar o ano.
  if (hardSignals >= 2 && concordant(cands, input.year)) {
    return { versionId: chosen.versionId, mid, confidence: input.year != null ? "confirmado" : "provavel", evidence };
  }
  // provavel: ≥1 sinal duro e candidato único.
  if (hardSignals >= 1 && distinctVersions === 1) {
    return { versionId: chosen.versionId, mid, confidence: "provavel", evidence };
  }
  // Resto → null (0 sinais duros nunca casa, mesmo com candidato único).
  return null;
}
