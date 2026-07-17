/**
 * Índice do catálogo ultimatespecs — testes puros (sem BD, correm em CI).
 * A extração de família e o fuel map são funções puras; as janelas de geração
 * testam-se com `buildIndex` sobre linhas sintéticas que espelham o catálogo real.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type UsModelRow,
  type UsVersionRow,
  buildIndex,
  genKeyOf,
  normEngineCode,
  normGearbox,
  resolveFamily,
  resolveVersionFuel,
} from "../../lib/engine/us-catalog";

const fam = (make: string, slug: string) => resolveFamily(make, slug).family;

// ── Família: convergência com o espaço do normModel ──────────────

test("família BMW: E46 e G20 (com carroçarias/LCI) → serie-3", () => {
  for (const slug of [
    "E46-3-Series-Sedan", "E46-LCI-3-Series-Touring", "G20-3-Series", "G20-3-Series-Sedan-LCI",
  ]) {
    assert.equal(fam("BMW", slug), "serie-3", slug);
  }
  // M2/M3 do mesmo chassis são família própria, não serie-2/3
  assert.equal(fam("BMW", "G80-M3"), "m3");
  assert.equal(fam("BMW", "E53-X5"), "x5");
});

test("família Mercedes: W177/Class-A → classe-a; ordem Class-X = X-Class", () => {
  assert.equal(fam("Mercedes Benz", "Class-A-(W177-2023)"), "classe-a");
  assert.equal(fam("Mercedes Benz", "A-Class-(W168)"), "classe-a");
  assert.equal(fam("Mercedes Benz", "W204-Class-C"), "classe-c");
  assert.equal(fam("Mercedes Benz", "S205-Estate-Class-C"), "classe-c"); // corpo à cabeça
  assert.equal(fam("Mercedes Benz", "C118-CLA"), "cla");
  assert.equal(fam("Mercedes Benz", "H247-GLA"), "gla");
  assert.equal(fam("Mercedes Benz", "W464-Class-G"), "g");
  assert.equal(fam("Mercedes Benz", "W123"), "w123"); // clássico chassis-only isolado
});

test("família MINI: F56 e J01 → mini-cooper; U25 → countryman", () => {
  assert.equal(fam("Mini", "Mini-F56"), "mini-cooper");
  assert.equal(fam("Mini", "J01-Hatch-Electric"), "mini-cooper");
  assert.equal(fam("Mini", "F55-5-Door"), "mini-cooper");
  assert.equal(fam("Mini", "Countryman-U25"), "countryman");
  assert.equal(fam("Mini", "Clubman-(F54)"), "clubman");
});

test("família Kia: Cerato-II → cerato; Carens-* → carens", () => {
  assert.equal(fam("Kia", "Cerato-II"), "cerato");
  for (const s of ["Carens-1", "Carens-15", "Carens-2", "Carens-3"]) assert.equal(fam("Kia", s), "carens");
});

test("família BYD: Dolphin-Surf ≠ Dolphin", () => {
  assert.equal(fam("BYD", "Dolphin-Surf-(EQE)"), "dolphin-surf");
  assert.equal(fam("BYD", "Dolphin"), "dolphin");
  assert.notEqual(fam("BYD", "Dolphin-Surf-(EQE)"), fam("BYD", "Dolphin"));
});

test("família Land Rover: L316/L663-Defender → defender", () => {
  assert.equal(fam("Land Rover", "L663-Defender-110"), "defender");
  assert.equal(fam("Land Rover", "L316-Defender-90"), "defender");
});

test("família: numéricos protegidos 208/2008/911/500 intactos", () => {
  assert.equal(fam("Peugeot", "208-II-(2023)"), "208");
  assert.equal(fam("Peugeot", "2008-Facelift"), "2008");
  assert.equal(fam("Porsche", "911-Cabriolet-(991-Series)"), "911");
  assert.equal(fam("Fiat", "500-2016"), "500");
  assert.equal(fam("Fiat", "500e-Cabrio"), "500e"); // 500e distinto de 500
});

test("resolveFamily lança em slug sem conteúdo utilizável", () => {
  // Slug que slugifica para vazio (sem alfanuméricos) → nenhuma família possível
  // → build FALHA (garante que nada é resolvido silenciosamente para "").
  assert.throws(() => resolveFamily("Acme", "---"), /irresolúvel/);
  // Slugs com conteúdo resolvem sempre (fallback determinístico ao 1.º token); a
  // revisão de novas famílias faz-se pelo diff do TSV, não por falha de build.
  assert.equal(resolveFamily("Acme", "Zonda-R").family, "zonda");
});

// ── Fuel map (auditoria mild-hybrid) ─────────────────────────────

test("fuel map: secções + deep fuel (full-HEV vs MHEV vs PHEV)", () => {
  assert.equal(resolveVersionFuel("petrol", "Petrol"), "gasolina");
  assert.equal(resolveVersionFuel("diesel", "Diesel"), "diesel");
  assert.equal(resolveVersionFuel("electric", "Electric"), "elétrico");
  assert.equal(resolveVersionFuel("pluginhybrid", "Plug-in Hybrid / Petrol"), "phev");
  // full-hybrid está em petrol/diesel no catálogo → reclassificar para híbrido
  assert.equal(resolveVersionFuel("petrol", "Hybrid / Petrol"), "híbrido");
  assert.equal(resolveVersionFuel("diesel", "Hybrid / Diesel"), "híbrido");
  // mild-hybrid mantém a base (política do normFuel)
  assert.equal(resolveVersionFuel("petrol", "Mild Hybrid / Petrol"), "gasolina");
  assert.equal(resolveVersionFuel("petrol", "Mild Petrol"), "gasolina");
  assert.equal(resolveVersionFuel("diesel", "Mild Diesel"), "diesel");
  assert.equal(resolveVersionFuel("diesel", "Mild Hybrid / Diesel"), "diesel");
});

test("fuel map: fallback à secção quando deep fuel é null", () => {
  assert.equal(resolveVersionFuel("petrol", null), "gasolina");
  assert.equal(resolveVersionFuel("diesel", null), "diesel");
  assert.equal(resolveVersionFuel("electric", null), "elétrico");
  assert.equal(resolveVersionFuel("pluginhybrid", null), "phev");
});

test("fuel map: secção other (bi-fuel LPG/CNG) excluída", () => {
  assert.equal(resolveVersionFuel("other", "Petrol or LPG"), null);
  assert.equal(resolveVersionFuel("other", "LPG or CNG"), null);
  assert.equal(resolveVersionFuel("other", null), null);
});

// ── normGearbox (partilhada anúncio/catálogo) ────────────────────

test("normGearbox: manual multilingue (deep, alemão, espanhol, francês)", () => {
  assert.equal(normGearbox("6 speed Manual"), "manual");
  assert.equal(normGearbox("Manual"), "manual");
  assert.equal(normGearbox("Schaltgetriebe"), "manual");
  assert.equal(normGearbox("mecánica"), "manual");
  assert.equal(normGearbox("mécanique"), "manual");
});

test("normGearbox: auto (badges e multilingue; ordem vence 'automatic'⊃'man')", () => {
  assert.equal(normGearbox("Automatic"), "auto");
  assert.equal(normGearbox("8 speed Automatic"), "auto");
  assert.equal(normGearbox("DSG"), "auto");
  assert.equal(normGearbox("S tronic"), "auto");
  assert.equal(normGearbox("S-tronic"), "auto");
  assert.equal(normGearbox("Steptronic"), "auto");
  assert.equal(normGearbox("Tiptronic"), "auto");
  assert.equal(normGearbox("Multitronic"), "auto");
  assert.equal(normGearbox("PowerShift"), "auto");
  assert.equal(normGearbox("DCT"), "auto");
  assert.equal(normGearbox("EDC"), "auto");
  assert.equal(normGearbox("PDK"), "auto");
  assert.equal(normGearbox("CVT"), "auto");
  assert.equal(normGearbox("Automaat"), "auto");
  assert.equal(normGearbox("Automatique"), "auto");
});

test("normGearbox: semi-automática é ambígua → null; null/vazio/desconhecido → null", () => {
  assert.equal(normGearbox("Semi-automatic"), null);
  assert.equal(normGearbox("Semiautomática"), null);
  assert.equal(normGearbox(null), null);
  assert.equal(normGearbox(""), null);
  assert.equal(normGearbox("5"), null);
});

test("normEngineCode: remove não-alfanuméricos e uppercase; vazio → null", () => {
  assert.equal(normEngineCode("N47 D20"), "N47D20");
  assert.equal(normEngineCode(" ea189 "), "EA189");
  assert.equal(normEngineCode(null), null);
  assert.equal(normEngineCode(""), null);
});

// ── Janelas de geração (buildIndex sobre linhas sintéticas) ──────

function mkModel(mid: string, make: string, slug: string, modelYear: number | null = null): UsModelRow {
  return { mid, make, slug, modelYear };
}
function mkVersion(mid: string, year: number, i = 0): UsVersionRow {
  return {
    versionId: `${mid}-${i}`, mid, name: `${mid} 1.0`, fuelSection: "petrol", fuel: "Petrol",
    year, powerHp: 100, powerKw: 74, displacementCc: 999, co2Wltp: null, co2Nedc: null,
    doors: null, gearbox: null, engineCode: null,
  };
}

test("gerações Carens: 3 mids, mesma família, janelas distintas e encadeadas", () => {
  const idx = buildIndex(
    [mkModel("C1", "Kia", "Carens-1"), mkModel("C2", "Kia", "Carens-15"), mkModel("C3", "Kia", "Carens-2")],
    [mkVersion("C1", 2000), mkVersion("C2", 2002), mkVersion("C3", 2006)],
  );
  const f = idx.byFamily.get("kia|carens");
  assert.ok(f, "família kia|carens existe");
  assert.equal(f!.generations.length, 3);
  // Janelas contíguas e DISJUNTAS: o −1 de graça no yearStart só na 1.ª geração
  // (as seguintes começam no arranque — a anterior já cobre o ano N−1).
  const wins = f!.generations.map((g) => [g.yearStart, g.yearEnd]);
  assert.deepEqual(wins, [[1999, 2001], [2002, 2005], [2006, null]]);
});

test("gerações Golf: 7/2017/8 mesma família, janelas encadeadas", () => {
  const idx = buildIndex(
    [
      mkModel("G7", "Volkswagen", "Golf-7"),
      mkModel("G75", "Volkswagen", "Golf-2017", 2017),
      mkModel("G8", "Volkswagen", "Golf-8"),
    ],
    [mkVersion("G7", 2012), mkVersion("G75", 2017), mkVersion("G8", 2020)],
  );
  const f = idx.byFamily.get("volkswagen|golf")!;
  assert.equal(f.generations.length, 3);
  // Janelas disjuntas (fronteira 2016/2017 e 2019/2020 sem sobreposição): um
  // anúncio 2019 fica no facelift 2017 (não vaza para o Golf-8 de 2020).
  assert.deepEqual(
    f.generations.map((g) => [g.yearStart, g.yearEnd]),
    [[2011, 2016], [2017, 2019], [2020, null]],
  );
});

test("gerações MINI: F56 e J01 são gerações DISTINTAS de mini-cooper", () => {
  const idx = buildIndex(
    [mkModel("F56", "Mini", "Mini-F56"), mkModel("J01", "Mini", "J01-Hatch-Electric")],
    [mkVersion("F56", 2014), mkVersion("J01", 2024)],
  );
  const f = idx.byFamily.get("mini|mini-cooper")!;
  assert.equal(f.generations.length, 2);
  assert.notEqual(f.generations[0].id, f.generations[1].id);
});

test("gerações BMW: variantes de carroçaria/LCI do mesmo chassis fundem-se", () => {
  const idx = buildIndex(
    [
      mkModel("E90", "BMW", "E90-3-Series"),
      mkModel("E91", "BMW", "E91-3-Series-Touring"),
      mkModel("E92", "BMW", "E92-3-Series-Coupe"),
      mkModel("E90L", "BMW", "E90-3-Series-LCI"),
    ],
    [mkVersion("E90", 2005), mkVersion("E91", 2005), mkVersion("E92", 2006), mkVersion("E90L", 2008)],
  );
  const f = idx.byFamily.get("bmw|serie-3")!;
  assert.equal(f.generations.length, 1, "E90/E91/E92 + LCI = uma só geração");
  assert.equal(f.generations[0].mids.length, 4);
});

test("buildIndex propaga doors/gearbox/engineCode para CatalogVersion", () => {
  // Versão com os campos preenchidos + versão sem (crus null → CatalogVersion null).
  const v1: UsVersionRow = {
    ...mkVersion("M1", 2020, 0), doors: 5, gearbox: "6 speed Manual", engineCode: "N47 D20",
  };
  const v2 = mkVersion("M1", 2020, 1); // doors/gearbox/engineCode a null (default da fixture)
  const idx = buildIndex([mkModel("M1", "BMW", "E90-3-Series")], [v1, v2]);
  const vers = idx.byFamily.get("bmw|serie-3")!.versions;
  const c1 = vers.find((v) => v.versionId === "M1-0")!;
  const c2 = vers.find((v) => v.versionId === "M1-1")!;
  assert.equal(c1.doors, 5);
  assert.equal(c1.gearbox, "manual"); // normGearbox do texto deep livre
  assert.equal(c1.engineCode, "N47D20"); // normEngineCode
  assert.equal(c2.doors, null);
  assert.equal(c2.gearbox, null);
  assert.equal(c2.engineCode, null);
});

// ── Property test sobre o catálogo real (só com BD docker) ───────

try {
  process.loadEnvFile(".env.local");
} catch {
  /* sem .env.local → salta */
}

// O CI tem DATABASE_URL mas catálogo us_* vazio — skip dinâmico dentro do teste
// (tsx compila para CJS: sem top-level await).
async function catalogoVazio(): Promise<boolean> {
  const postgres = (await import("postgres")).default;
  const client = postgres(process.env.DATABASE_URL as string, { prepare: false });
  try {
    const r = await client`select count(*)::int as n from us_models`;
    return Number(r[0]?.n ?? 0) === 0;
  } finally {
    await client.end({ timeout: 5 });
  }
}
const AVISO_CI = "sem catálogo us_* na BD (CI) — teste saltado";

test(
  "property: 100% dos mids resolvem por regra/exceção; exceções ≤ 90",
  { skip: !process.env.DATABASE_URL && "sem DATABASE_URL (BD docker)" },
  async (t) => {
    if (await catalogoVazio()) return t.skip(AVISO_CI);
    const { buildUsCatalog } = await import("../../lib/engine/us-catalog");
    const { db, closeDb } = await import("../../db");
    const idx = await buildUsCatalog(db);
    assert.equal(idx.stats.porRegra + idx.stats.porExcecao + idx.stats.ignorados, idx.stats.mids);
    assert.ok(idx.stats.porExcecao + idx.stats.ignorados <= 90, "orçamento de exceções");
    await closeDb();
  },
);

// ── genKey ───────────────────────────────────────────────────────

test("genKey: funde variantes de carroçaria e LCI do mesmo stem", () => {
  assert.equal(genKeyOf("Golf-7"), genKeyOf("Golf-7-Variant"));
  assert.equal(genKeyOf("E46-3-Series-Sedan"), genKeyOf("E46-LCI-3-Series-Coupe"));
  assert.notEqual(genKeyOf("Golf-7"), genKeyOf("Golf-2017"));
});
