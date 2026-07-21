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

test("fuel map: nome plug-in vence a secção quando o deep fuel falta (BYD DM-i)", () => {
  // caso real: Seal U DM-i na secção electric com deep fuel vazio → PHEV, não elétrico
  assert.equal(resolveVersionFuel("electric", null, "Seal U DM-i 1.5 Plug-in Hybrid e-CVT"), "phev");
  assert.equal(resolveVersionFuel("electric", null, "Seal U 87 kWh Electric"), "elétrico");
  // com deep fuel presente, a autoridade mantém-se (o nome não sobrepõe)
  assert.equal(resolveVersionFuel("electric", "Electric", "DM-i qualquer"), "elétrico");
  // "dmi" só com fronteiras: não apanhar substrings ("Redmi"-like)
  assert.equal(resolveVersionFuel("electric", null, "Admiral 50 kWh"), "elétrico");
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

test("normGearbox: formatos do Passo 0 (BD real) que falhavam ou classificavam mal", () => {
  assert.equal(normGearbox("AUTO"), "auto"); // "auto" nu não batia /autom/
  assert.equal(normGearbox("Handgeschakeld"), "manual"); // NL: "schak" ≠ "schalt"
  assert.equal(normGearbox("Halbautomatik"), null); // semi DE — contém "autom", NUNCA auto
  assert.equal(normGearbox("Doppelkupplung"), "auto"); // dupla embraiagem = DSG
  assert.equal(normGearbox("Sequencial"), null); // sequencial é ambíguo
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

test("gerações Carens: 3 mids da MESMA linha (base), janelas distintas e encadeadas", () => {
  // Os três são o Carens base (corpo neutro, sem derivado) → encadeiam na MESMA linha
  // de derivado. O encadeamento por linha continua a produzir janelas contíguas e
  // disjuntas dentro da linha (é o comportamento normal do clusterGenerations por chamada).
  const idx = buildIndex(
    [mkModel("C1", "Kia", "Carens-1"), mkModel("C2", "Kia", "Carens-2"), mkModel("C3", "Kia", "Carens-3")],
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

test("gerações BMW: LCI funde na linha base; touring/coupe são linhas de derivado próprias", () => {
  // Encadeamento POR LINHA DE DERIVADO: o E90 sedan e o E90-LCI (mesmo corpo neutro; o
  // LCI é removido no genKey) fundem-se numa só geração da linha base; o Touring e o
  // Coupe são carroçarias distintas → cada um a sua linha e a sua geração. Antes, todos
  // os corpos do mesmo chassis fundiam por proximidade de ano; separá-los por linha é o
  // que impede que a linha de um derivado seja fechada pela chegada de OUTRO (o bug GT/GC).
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
  assert.equal(f.generations.length, 3, "base (E90+LCI) + touring + coupe");
  const base = f.generations.find((g) => g.id.includes("|base#"))!;
  assert.deepEqual([...base.mids].sort(), ["E90", "E90L"]); // LCI funde no sedan base
  assert.equal(idx.midInfo.get("E91")!.derivative, "touring");
  assert.equal(idx.midInfo.get("E92")!.derivative, "coupe");
  // ids de geração únicos na família.
  assert.equal(new Set(f.generations.map((g) => g.id)).size, 3);
});

test("gerações Série 2 (bug real): a linha Gran-Tourer não é fechada pelo Gran-Coupe", () => {
  // Antes, o clusterGenerations encadeava TODOS os genKeys da família por proximidade de
  // ano e fechava a janela da linha Gran-Tourer (F46 2015, F46-LCI 2018) no arranque do
  // Gran-Coupe (F44 2020) — OUTRA carroçaria, não o sucessor. Um GT de 2022 caía fora da
  // janela da sua linha e só sobrava o Gran-Coupe (match na carroçaria errada). Com o
  // encadeamento POR LINHA DE DERIVADO, cada carroçaria tem a sua sucessão: a linha GT
  // fica ABERTA e um GT 2022 volta a ter candidatos.
  const idx = buildIndex(
    [
      mkModel("F45", "BMW", "F45-2-Series-Active-Tourer", 2014),
      mkModel("F45L", "BMW", "F45-LCI-2-Series-Active-Tourer", 2017),
      mkModel("F46", "BMW", "F46-2-Series-Gran-Tourer", 2015),
      mkModel("F46L", "BMW", "F46-LCI-2-Series-Gran-Tourer", 2018),
      mkModel("F44", "BMW", "F44-2-Series-Gran-Coupe", 2020),
    ],
    [mkVersion("F45", 2014), mkVersion("F45L", 2017), mkVersion("F46", 2015), mkVersion("F46L", 2018), mkVersion("F44", 2020)],
  );
  const f = idx.byFamily.get("bmw|serie-2")!;
  const genOf = (mid: string) => f.generations.find((g) => g.id === idx.midInfo.get(mid)!.generationId)!;

  // Linha Gran-Tourer: F46 + F46-LCI numa geração ABERTA (yearEnd null; o F46-LCI funde no
  // F46 pelo genKey que remove o LCI) → um GT 2022 continua dentro da janela.
  const gt = genOf("F46");
  assert.equal(gt.id, genOf("F46L").id, "F46 e F46-LCI na mesma geração da linha GT");
  assert.equal(gt.yearEnd, null, "linha GT aberta — nunca fechada pelo Gran-Coupe");
  assert.ok(gt.yearStart != null && gt.yearStart <= 2022, "GT 2022 dentro da janela");
  assert.equal(idx.midInfo.get("F46")!.derivative, "gran-tourer");

  // Linha Active-Tourer: própria, distinta da GT.
  const at = genOf("F45");
  assert.equal(at.id, genOf("F45L").id);
  assert.notEqual(at.id, gt.id);
  assert.equal(idx.midInfo.get("F45")!.derivative, "active-tourer");

  // Linha Gran-Coupe: própria; a sua chegada (2020) NÃO fecha a linha GT.
  const gc = genOf("F44");
  assert.notEqual(gc.id, gt.id);
  assert.equal(idx.midInfo.get("F44")!.derivative, "gran-coupe");

  // ids de geração únicos na família (o formato do id é opaco aos consumidores).
  assert.equal(new Set(f.generations.map((g) => g.id)).size, f.generations.length);
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

// ── derivative por mid (tokens distintivos da família) ───────────

test("derivative por mid: Gran Tourer/Coupe/Active Tourer distintos; base → ''", () => {
  const idx = buildIndex(
    [
      mkModel("F46", "BMW", "F46-2-Series-Gran-Tourer", 2015),
      mkModel("F46L", "BMW", "F46-LCI-2-Series-Gran-Tourer", 2018),
      mkModel("F44", "BMW", "F44-2-Series-Gran-Coupe", 2020),
      mkModel("F45", "BMW", "F45-LCI-2-Series-Active-Tourer", 2016),
    ],
    [mkVersion("F46", 2015), mkVersion("F46L", 2018), mkVersion("F44", 2020), mkVersion("F45", 2016)],
  );
  const d = (mid: string) => idx.midInfo.get(mid)?.derivative;
  // ordem do slug (Set preserva inserção) → "gran-coupe", não "coupe-gran".
  assert.equal(d("F46"), "gran-tourer");
  assert.equal(d("F46L"), "gran-tourer");
  assert.equal(d("F44"), "gran-coupe");
  assert.equal(d("F45"), "active-tourer");

  // Base (só carroçaria neutra) → "" ; o derivado real fica com os seus tokens.
  const cor = buildIndex(
    [
      mkModel("CX", "Toyota", "Corolla-Cross", 2022),
      mkModel("CH", "Toyota", "Corolla-E210-Hatchback-2023", 2023),
    ],
    [mkVersion("CX", 2022), mkVersion("CH", 2023)],
  );
  assert.equal(cor.midInfo.get("CH")?.derivative, "");
  assert.equal(cor.midInfo.get("CX")?.derivative, "cross");
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
