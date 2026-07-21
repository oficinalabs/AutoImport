/**
 * Resolver determinístico anúncio → versão do catálogo ultimatespecs (Fase 2).
 *
 * `resolveVersion(input, catalog)` devolve o resultado do match (ou null) SEM
 * tocar na BD: o índice (`UsCatalogIndex`) vem injetado. Puro e determinístico —
 * mesmo input + mesmo catálogo ⇒ mesmo output byte-a-byte.
 *
 * Filosofia (docs/08): NUNCA adivinhar, e distinguir "sei QUAL versão" de "sei o
 * MOTOR mas não a variante". O discriminante é `kind`:
 *  - `exato`: ≥2 sinais duros (potência/cilindrada/badge) batidos, candidatos
 *    concordantes, ANO presente E uma só versão sobrevivente — sabemos a versão
 *    canónica exata. Escreve-se `us_version_id`.
 *  - `designacao`: os mesmos ≥2 sinais + concordância + ano, mas sobrevivem ≥2
 *    versões (gémeas: cabrio/coupé, manual/auto que os sinais do anúncio não
 *    separam). Sabemos o motor mas não a variante → gravam-se FACTOS de
 *    designação (specs medianas + janela de geração), não uma versão.
 *  - `provavel`: 1 sinal + candidato único, OU ≥2 sinais mas sem ano/derivado
 *    ambíguo. NÃO se escreve na BD (só conta no relatório).
 * Tudo o resto → null (sem sinais duros nunca há match, mesmo com candidato
 * único). Antes da decisão, os "splitters" tentam separar gémeos por sinais
 * SUAVES (trim curado, caixa, portas, CO₂) — estreitam sem contar como sinal
 * duro. A cascata e as tolerâncias vêm do plano "matching perfeito".
 */
import { parsePowerFromText } from "../../tools/collector/lib/db-sink";
import type { FuelType } from "../types";
import { normFuel, normMake, normModel, normModelViaRule, slugify } from "./normalize-vehicle";
import {
  BODY_TOKENS,
  type CatalogVersion,
  distinctiveTokensByMid,
  type Generation,
  NEUTRAL_BODY,
  normGearbox,
  type UsCatalogIndex,
} from "./us-catalog";

export interface ResolveInput {
  makeRaw: string;
  modelRaw: string;
  variant: string | null;
  fuelRaw: string | null;
  year: number | null;
  powerHp: number | null;
  displacementCc: number | null;
  co2: number | null;
  /** texto livre da caixa do anúncio ("6 speed Manual", "DSG", "Schaltgetriebe") */
  gearbox?: string | null;
  doors?: number | null;
  /** raw->>'engine_code' (só standvirtual; SEM splitter de motor ativo — ver nota) */
  engineCode?: string | null;
  /** texto extra do anúncio (título + slug do detail_url) — para tokens de
   * desambiguação (derivativeGuard, desempate de trim, trimset). NÃO alimenta
   * badges/potência/litragem/família (o slug do URL traz ruído — cores,
   * equipamento — que não pode virar sinal duro). ÚNICA exceção deliberada: o
   * kWh da bateria dos elétricos (ver ramo do kWh) — a unidade "kWh" é inequívoca,
   * não é ruído de cor/equipamento. */
  extraText?: string | null;
  /** título do vendedor (o segmento-slug do detail_url que o VENDEDOR escreveu,
   * distinto do balde do agregador) — SÓ para a guarda de coerência: um badge
   * forte + potência que apontem inequivocamente para OUTRA designação do mesmo
   * make demovem o match a null. NUNCA alimenta um match positivo. */
  sellerTitle?: string | null;
}

/**
 * Factos de designação: o que sabemos quando o motor está provado mas ≥2 versões
 * gémeas sobrevivem. Specs medianas dos candidatos (o `concordant()` garante que
 * cabem numa designação) + a geração fixável. O compute-costs escolhe o CO₂ pela
 * norma da matrícula, por isso guardam-se ambas.
 */
export interface DesignationFacts {
  displacementCc: number | null;
  co2Wltp: number | null;
  co2Nedc: number | null;
  powerHp: number | null;
  /** mid único dos candidatos; null se abrangem vários mids */
  mid: string | null;
  /** derivado/corpo único dos candidatos (tokens distintivos, ex. "gran-tourer");
   * "" = modelo base; null = candidatos abrangem derivados distintos */
  derivative: string | null;
  /** geração datada única, senão null */
  genWindow: { start: number; end: number | null } | null;
  /** nº de versões distintas (≥2 por definição) */
  versions: number;
}

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
    /** kWh da bateria (só elétricos): 2.º sinal duro batido no displacement_cc EV. */
    batteryKwh?: number;
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
  /** sinais SUAVES que separaram gémeos (só os que ESTREITARAM de facto).
   * "engine" fica reservado no contrato mas NÃO é implementado (a auditoria de
   * cobertura do engine_code ainda não correu). */
  splitters?: ("trimset" | "gearbox" | "doors" | "co2")[];
  /** o título do vendedor prova (badge forte + potência) uma designação que os
   * candidatos não explicam ⇒ o match foi demovido. NUNCA presente num resultado
   * não-null (a demoção devolve null); fica no contrato para o invariante do
   * property test ("nenhum não-null transporta dadosIncoerentes"). */
  dadosIncoerentes?: true;
}

export type MatchResult =
  | { kind: "exato"; versionId: string; mid: string; evidence: MatchEvidence }
  | { kind: "designacao"; facts: DesignationFacts; evidence: MatchEvidence }
  | { kind: "provavel"; versionId: string; mid: string | null; evidence: MatchEvidence };

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

/**
 * kWh da bateria no texto do anúncio ("54 kWh", "80.8kWh", "43,2 kWh"). A unidade
 * kWh é inequívoca (exige o "h" — "115 kW" de potência NÃO casa); vírgula ou ponto
 * decimal; espaço opcional. Primeiro match; null se ausente.
 */
function batteryKwhFromText(text: string): number | null {
  const m = /(\d{1,3}(?:[.,]\d)?)\s*kwh/i.exec(text);
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
// `isNoiseToken`/`NEUTRAL_BODY`/`distinctiveTokensByMid` vivem em us-catalog (para
// o build partilhar a MESMA lógica sem ciclo de import); aqui só o que é do resolver.

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
 * Guarda de derivados: quando os candidatos sobreviventes abrangem mids cujos
 * slugs diferem em TOKENS DISTINTIVOS de modelo/carroçaria (cross, cabrio,
 * 90/110 do Defender, cargo/life das carrinhas…), desambigua pelo texto:
 *  (i)   o texto nomeia um derivado → só esse grupo sobrevive;
 *  (ii)  não nomeia nenhum mas há mid(s) BASE (só carroçaria neutra) → o base
 *        (Corolla hatch, Série-3 sedan, T-Roc SUV);
 *  (iii) sem base: se os distintivos forem SÓ carroçaria especial (coupé/cabrio)
 *        fica trimAmbiguo (partilham motor/cc); senão é `derivadoAmbiguo`
 *        (Defender 90/110, Combo cargo/life) → o consumidor demove a provável.
 * Os tokens distintivos vêm da diferença dos slugs (menos ruído) sobre os mids DOS
 * CANDIDATOS (universo local, distinto do núcleo-família do build) — determinístico.
 */
function derivativeGuard(
  cands: CatalogVersion[],
  adTokens: Set<string>,
  midInfo: UsCatalogIndex["midInfo"],
): { cands: CatalogVersion[]; derivadoAmbiguo: boolean } {
  const mids = [...new Set(cands.map((v) => v.mid))];
  if (mids.length < 2) return { cands, derivadoAmbiguo: false };

  const distinctive = distinctiveTokensByMid(
    new Map(mids.map((mid) => [mid, midInfo.get(mid)?.slugTokens ?? []])),
  );
  const universe = new Set<string>();
  for (const d of distinctive.values()) for (const t of d) universe.add(t);
  if (universe.size === 0) return { cands, derivadoAmbiguo: false }; // sem derivados reais

  // (i) o anúncio nomeia algum derivado → fica só quem o anúncio nomeia. Preferimos
  // CONTENÇÃO TOTAL: se ≥1 mid tem o conjunto distintivo INTEIRO contido em adTokens,
  // ficam só esses. Ex. real: "216d Gran Tourer" → adTokens ⊇ {gran,tourer} contém
  // por inteiro o Gran-Tourer {gran,tourer} mas só parcialmente o Gran-Coupe
  // {gran,coupe} (partilham "gran") → fica só o Gran-Tourer (o bug era o inverso).
  // Sem contenção total, cai no critério largo (some): qualquer token nomeado mantém.
  const named = [...universe].some((t) => adTokens.has(t));
  if (named) {
    const full = mids.filter((mid) => {
      const d = distinctive.get(mid)!;
      return d.size > 0 && [...d].every((t) => adTokens.has(t));
    });
    const keep = new Set(
      full.length ? full : mids.filter((mid) => [...distinctive.get(mid)!].some((t) => adTokens.has(t))),
    );
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

// ── Splitters de gémeos ──────────────────────────────────────────

/**
 * Whitelist curada de badges de EQUIPAMENTO/performance que distinguem gémeos de
 * igual potência/cilindrada (a potência/cc não os separa: GTI vs GTI Clubsport).
 * v1 SEM letras isoladas (r/m/s/n são perigosas — "R-Line" não é "R", "S line"
 * não é "S"); só tokens inequívocos.
 */
const TRIM_TOKENS = new Set([
  "gti", "gtd", "gte", "gts", "gtx", "rs", "vrs", "cupra", "jcw", "competition",
  "clubsport", "performance", "abarth", "nismo", "polestar", "quadrifoglio", "gsi", "opc",
]);

/**
 * Compostos de equipamento colados por hífen: colapsam num único token opaco
 * ANTES de tokenizar, para nunca contribuírem uma letra isolada (r-line→rline).
 * Case-insensitive, sobre o texto cru do anúncio antes do slugify.
 */
const TRIM_COMPOUNDS: [RegExp, string][] = [
  [/r-line/gi, "rline"], [/s-line/gi, "sline"], [/m-sport/gi, "msport"],
  [/m-paket/gi, "mpaket"], [/amg-line/gi, "amgline"], [/gt-line/gi, "gtline"],
];

/** Trim-tokens do anúncio ∩ TRIM_TOKENS (compostos colapsados no texto cru). */
function adTrimTokens(modelRaw: string, variant: string | null, extraText: string | null): Set<string> {
  let text = `${modelRaw} ${variant ?? ""} ${extraText ?? ""}`;
  for (const [re, to] of TRIM_COMPOUNDS) text = text.replace(re, to);
  const tokens = slugify(text).split("-").filter(Boolean);
  return new Set(tokens.filter((t) => TRIM_TOKENS.has(t)));
}

/** Trim-tokens do catálogo ∩ TRIM_TOKENS (colapsa hífenes: "r-line"→"rline"). */
function candTrimTokens(tokens: string[]): Set<string> {
  return new Set(tokens.map((t) => t.replace(/-/g, "")).filter((t) => TRIM_TOKENS.has(t)));
}

/** Igualdade de conjuntos (mesmos elementos). */
function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * Factos de designação a partir dos candidatos gémeos (kind `designacao`).
 * Cada spec é a MEDIANA-BAIXA dos valores não-nulos: `xs.sort()[⌊(n−1)/2⌋]` —
 * determinística e inteira; como o `concordant()` já limita o spread, a mediana
 * cai sempre dentro da designação (não inventa um valor fora dos candidatos).
 */
function deriveFacts(
  cands: CatalogVersion[],
  year: number | null,
  genById: Map<string, Generation>,
  midInfo: UsCatalogIndex["midInfo"],
): DesignationFacts {
  const lowMedian = (xs: (number | null)[]): number | null => {
    const ys = xs.filter((v): v is number => v != null).sort((a, b) => a - b);
    return ys.length ? ys[Math.floor((ys.length - 1) / 2)] : null;
  };
  const mids = new Set(cands.map((v) => v.mid));
  const versionIds = new Set(cands.map((v) => v.versionId));

  // derivative: o derivado (do índice) único entre os mids dos candidatos; se
  // abrangem derivados distintos (Gran-Tourer + Gran-Coupe) → null. Usa o
  // derivado FAMÍLIA-WIDE do midInfo (o jusante confina a amostra PT por ele).
  const derivs = new Set([...mids].map((mid) => midInfo.get(mid)?.derivative ?? ""));
  const derivative = derivs.size === 1 ? [...derivs][0] : null;

  // genWindow: geração fixável única. Se todos os candidatos partilham UMA
  // geração usa-a; senão, se há exatamente uma geração DATADA que contém o ano
  // usa essa; senão null. Geração sem yearStart → null (janela inútil).
  const gens = new Set(cands.map((v) => v.generationId));
  let gid: string | null = null;
  if (gens.size === 1) {
    gid = [...gens][0];
  } else if (year != null) {
    const dated = new Set(
      cands.filter((v) => genDatedContains(genById.get(v.generationId)!, year)).map((v) => v.generationId),
    );
    if (dated.size === 1) gid = [...dated][0];
  }
  let genWindow: DesignationFacts["genWindow"] = null;
  if (gid) {
    const g = genById.get(gid)!;
    if (g.yearStart != null) genWindow = { start: g.yearStart, end: g.yearEnd };
  }

  return {
    displacementCc: lowMedian(cands.map((v) => v.displacementCc)),
    co2Wltp: lowMedian(cands.map((v) => v.co2Wltp)),
    co2Nedc: lowMedian(cands.map((v) => v.co2Nedc)),
    powerHp: lowMedian(cands.map((v) => v.powerHp)),
    mid: mids.size === 1 ? [...mids][0] : null,
    derivative,
    genWindow,
    versions: versionIds.size,
  };
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

  // kWh da bateria: 2.º sinal duro dos ELÉTRICOS (ramo paralelo ao da cilindrada,
  // que fica ignorada neles porque o catálogo guarda o kWh no displacement_cc das
  // versões EV). Extraído de variant + extraText (a exceção deliberada em que o
  // extraText alimenta um sinal duro — a unidade "kWh" é inequívoca). Sinal
  // presente que não bate NENHUM candidato = prova contra ⇒ null (como a cc).
  if (fuel === "elétrico") {
    const kwh = batteryKwhFromText(`${input.variant ?? ""} ${input.extraText ?? ""}`);
    if (kwh != null) {
      const filtered = cands.filter(
        (v) => v.displacementCc != null && Math.abs(v.displacementCc - Math.round(kwh)) <= 2,
      );
      if (!filtered.length) return null;
      cands = filtered;
      signals.batteryKwh = kwh;
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

  // Tokens de desambiguação: modelRaw + variant + extraText (título/slug do URL).
  // SÓ para o derivativeGuard, o desempate de trim e o trimset — os sinais DUROS
  // (badges/potência/litragem/família) já foram calculados só de modelRaw/variant.
  const trimTokens = slugify(`${input.modelRaw} ${input.variant ?? ""} ${input.extraText ?? ""}`)
    .split("-").filter(Boolean);
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

  // ── Splitters de gémeos ──
  // Só corre com >1 versão distinta, dentro de um conjunto CONCORDANTE (a mesma
  // designação) E com um SÓ mid. A concordância impede que um sinal suave escolha
  // entre carros materialmente diferentes; o mid único impede que escolha entre
  // DERIVADOS/CORPOS (Gran Tourer vs Gran Coupe — o caso do bug): um sinal suave
  // separa gémeas do MESMO modelo (Cooper S manual/auto), nunca decide o derivado.
  // Mids mistos + specs concordantes → designacao (motor provado, variante não
  // única). (Um subconjunto de um conjunto concordante de mid único continua
  // concordante e de mid único — basta avaliar uma vez.) Cada sinal é um filtro
  // SUAVE: aplica-se só se (a) o anúncio o traz, (b) ≥1 candidato bate e (c) parte
  // o conjunto (estreita sem esvaziar). Nunca conta para hardSignals nem demove o
  // tier. Pára quando as versões distintas chegam a 1.
  const splitters: NonNullable<MatchEvidence["splitters"]> = [];
  const distinctCount = () => new Set(cands.map((v) => v.versionId)).size;
  const splittable = concordant(cands, input.year) && new Set(cands.map((v) => v.mid)).size === 1;

  if (splittable && distinctCount() > 1) {
    // 1. trimset — igualdade de conjuntos de badges de equipamento curados.
    // Prefere os candidatos cujo conjunto de trim-tokens IGUALA o do anúncio
    // (elimina "GTI Clubsport" quando o anúncio diz só "GTI"); se nenhum iguala
    // exatamente, não atua (não adivinha o trim mais rico).
    const adTrim = adTrimTokens(input.modelRaw, input.variant, input.extraText ?? null);
    if (adTrim.size) {
      const eq = cands.filter((v) => setEq(candTrimTokens(v.tokens), adTrim));
      if (eq.length && eq.length < cands.length) {
        cands = eq;
        splitters.push("trimset");
      }
    }
  }
  if (splittable && distinctCount() > 1) {
    // 2. gearbox — caixa classificada em manual/auto pelos dois lados (normGearbox).
    const adGb = normGearbox(input.gearbox ?? null);
    if (adGb) {
      const f = cands.filter((v) => v.gearbox === adGb);
      if (f.length && f.length < cands.length) {
        cands = f;
        splitters.push("gearbox");
      }
    }
  }
  if (splittable && distinctCount() > 1) {
    // 3. doors — igualdade exata do nº de portas.
    if (input.doors != null) {
      const f = cands.filter((v) => v.doors === input.doors);
      if (f.length && f.length < cands.length) {
        cands = f;
        splitters.push("doors");
      }
    }
  }
  if (splittable && distinctCount() > 1) {
    // 4. co2 — só se o anúncio traz CO₂ E TODOS os candidatos têm CO₂ da norma do
    // ano; escolhe os de |Δ| mínimo, mas só se esse Δ ≤ 10 g. Acima disso o
    // anúncio pode estar na norma errada (NEDC vs WLTP) — não adivinhar.
    if (input.co2 != null && cands.every((v) => normCo2(v, input.year) != null)) {
      const co2Ad = input.co2;
      const best = Math.min(...cands.map((v) => Math.abs(normCo2(v, input.year)! - co2Ad)));
      if (best <= 10) {
        const f = cands.filter((v) => Math.abs(normCo2(v, input.year)! - co2Ad) === best);
        if (f.length && f.length < cands.length) {
          cands = f;
          splitters.push("co2");
        }
      }
    }
  }
  // Splitter `engine` (engine_code) NÃO é implementado: a auditoria de cobertura
  // do engine_code ainda não correu (o campo fica no contrato para quando existir).

  // ── Guarda de coerência do título do vendedor (sellerTitle) ──
  // Fontes agregadoras (theparking) metem por vezes o anúncio no BALDE ERRADO: os
  // campos estruturados dizem "840d 340cv" mas o slug do título do vendedor diz a
  // verdade ("320d 190 mild-hybrid"). Quando o sellerTitle prova — por regra DUPLA
  // (badge forte E potência) — uma designação de OUTRA família do mesmo make que os
  // candidatos sobreviventes NÃO explicam, o match é dado podre e demove-se a null.
  // A regra é dupla de propósito (um badge OU uma potência sozinhos são ruído);
  // NUNCA alimenta um match positivo — só o mata. O lookup make-wide é on-demand:
  // só corre quando o sellerTitle traz um badge que nenhum sobrevivente explica.
  if (input.sellerTitle) {
    const stTokens = slugify(input.sellerTitle).split("-").filter(Boolean);
    const stBadges = strongBadges(input.sellerTitle, null);
    const alienBadges = stBadges.filter(
      (b) => b !== familySlug && !cands.some((v) => v.tokens.includes(b)),
    );
    if (alienBadges.length) {
      // Números que são DESIGNAÇÃO DE MODELO (o run de dígitos de um badge: "220"
      // de "220d"/"glc220", "350" de "350d", "200" de "e200") NÃO são potência — o
      // "220" de um "GLC 220 220d" é a classe, não 220 cv. Sem isto, a coincidência
      // modelo-número ↔ cv de um 4matic/chassis de outra família gerava conflitos
      // falsos em massa (auditoria: 17 Mercedes/BMW coerentes demovidos vs 1 real).
      // E um dígito seguido de unidade kW/kWh é kW/bateria, não cv ("152 kW").
      const modelNums = new Set<number>();
      for (const b of stBadges) for (const m of b.matchAll(/\d+/g)) modelNums.add(Number(m[0]));
      const stPowers: number[] = [];
      for (let i = 0; i < stTokens.length; i++) {
        const t = stTokens[i];
        if (!/^\d+$/.test(t)) continue;
        const n = Number(t);
        if (n < 60 || n > 900 || modelNums.has(n)) continue;
        if (/^kw/i.test(stTokens[i + 1] ?? "")) continue;
        stPowers.push(n);
      }
      if (stPowers.length) {
        const matchesSurvivor = (p: number) =>
          cands.some((c) => c.powerHp != null && Math.abs(c.powerHp - p) <= powerTol(p));
        const conflito = [...catalog.byFamily.entries()].some(
          ([key, fam]) =>
            key.startsWith(`${makeSlug}|`) &&
            fam.versions.some(
              (v) =>
                v.powerHp != null &&
                alienBadges.some((b) => v.tokens.includes(b)) &&
                stPowers.some((p) => Math.abs(v.powerHp! - p) <= powerTol(p) && !matchesSurvivor(p)),
            ),
        );
        if (conflito) return null;
      }
    }
  }

  // ── Escolha e flags (sobre o conjunto final, pós-splitters) ──
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
    ...(splitters.length ? { splitters } : {}),
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
  // G = base forte: ≥2 sinais duros, candidatos concordantes, ANO presente (sem
  // ano não há prova de geração) e derivados não-ambíguos.
  const G =
    hardSignals >= 2 && concordant(cands, input.year) && input.year != null && !derivadoAmbiguo;

  // exato: G + uma só versão sobrevivente. mid nunca null (versão única ⇒ geração
  // única ⇒ geracaoAmbigua false).
  if (G && distinctVersions === 1) {
    return { kind: "exato", versionId: chosen.versionId, mid: chosen.mid, evidence };
  }
  // designacao: G mas ≥2 versões gémeas (os splitters não as separaram) — sabemos
  // o motor, não a variante → factos de designação.
  if (G && distinctVersions > 1) {
    return { kind: "designacao", facts: deriveFacts(cands, input.year, genById, catalog.midInfo), evidence };
  }
  // provavel: ≥2 sinais + concordantes mas sem ano OU derivado ambíguo. O Defender
  // 90/110 NÃO vira designacao: derivado incerto é MODELO incerto, não uma variante
  // dentro do mesmo motor.
  if (hardSignals >= 2 && concordant(cands, input.year) && (input.year == null || derivadoAmbiguo)) {
    return { kind: "provavel", versionId: chosen.versionId, mid, evidence };
  }
  // provavel: 1 sinal duro e candidato único.
  if (hardSignals >= 1 && distinctVersions === 1) {
    return { kind: "provavel", versionId: chosen.versionId, mid, evidence };
  }
  // Resto → null (0 sinais duros nunca casa, mesmo com candidato único).
  return null;
}
