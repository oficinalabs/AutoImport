/**
 * Resolver anúncio → versão (Fase 2).
 *
 * Três blocos:
 *  1. Unit puro (sem BD, corre em CI) — helpers + casos de PRODUTO sobre um
 *     catálogo sintético que espelha o real (840i≠M850i≠M8, iX 40≠45, Golf
 *     GTI≠R≠1.5, F56≠J01, Dolphin≠Surf, Kauai→Kona, HEV≠PHEV, elétrico≠térmico,
 *     Grand i10≠Grand Santa Fe, GPL→null) + splitters de gémeos (trim/caixa/
 *     portas/CO₂) que separam exato de designacao.
 *  2. Golden (só com BD docker) — ~200 anúncios REAIS rotulados por método:
 *     precisão de exato/designacao = 100%, cobertura mínima por tier.
 *  3. Property (só com BD docker) — invariantes sobre os 22k listings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  litersFromVariant,
  type MatchResult,
  type ResolveInput,
  resolveVersion,
} from "../../lib/engine/match-version";
import {
  type UsModelRow,
  type UsVersionRow,
  buildIndex,
  type UsCatalogIndex,
} from "../../lib/engine/us-catalog";

// ── Catálogo sintético (espelha o real; sem BD) ──────────────────

let VID = 1000;
type VSpec = {
  name: string; fuelSection: string; fuel: string | null; year: number;
  hp: number | null; cc: number | null; co2w?: number | null; co2n?: number | null;
  doors?: number | null; gearbox?: string | null; engineCode?: string | null;
};
const models: UsModelRow[] = [];
const versions: UsVersionRow[] = [];
function model(mid: string, make: string, slug: string, modelYear: number | null, vs: VSpec[]) {
  models.push({ mid, make, slug, modelYear });
  for (const v of vs) {
    versions.push({
      versionId: String(VID++), mid, name: v.name, fuelSection: v.fuelSection, fuel: v.fuel,
      year: v.year, powerHp: v.hp, powerKw: v.hp != null ? Math.round(v.hp / 1.35962) : null,
      displacementCc: v.cc, co2Wltp: v.co2w ?? null, co2Nedc: v.co2n ?? null,
      doors: v.doors ?? null, gearbox: v.gearbox ?? null, engineCode: v.engineCode ?? null,
    });
  }
}

// BMW Série 8 — clássico E31 (isolado) + moderno G15 (840d/840i/M850i/M8/Comp)
model("E31", "BMW", "E31-8-Series", null, [
  { name: "E31 8 Series 840 Ci", fuelSection: "petrol", fuel: "Petrol", year: 1993, hp: 286, cc: 3982 },
]);
model("G15", "BMW", "G15-8-Series-Coupe", null, [
  { name: "G15 840d xDrive", fuelSection: "diesel", fuel: "Diesel", year: 2019, hp: 320, cc: 2993, co2w: 176 },
  { name: "G15 840i", fuelSection: "petrol", fuel: "Petrol", year: 2019, hp: 340, cc: 2998, co2w: 195 },
  { name: "G15 840i xDrive", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 333, cc: 2998, co2w: 199 },
  { name: "G15 M850i xDrive", fuelSection: "petrol", fuel: "Petrol", year: 2019, hp: 530, cc: 4395, co2w: 246 },
  { name: "G15 M8", fuelSection: "petrol", fuel: "Petrol", year: 2019, hp: 600, cc: 4395, co2w: 261 },
  { name: "G15 M8 Competition", fuelSection: "petrol", fuel: "Petrol", year: 2019, hp: 625, cc: 4395, co2w: 262 },
]);
// BMW iX — gen 2021 (40/50) e gen 2025 (45/60), elétricos (cc = kWh, ruído)
model("IX1", "BMW", "iX", null, [
  { name: "iX xDrive40", fuelSection: "electric", fuel: null, year: 2021, hp: 326, cc: 77 },
  { name: "iX xDrive50", fuelSection: "electric", fuel: null, year: 2021, hp: 524, cc: 112 },
]);
model("IX2", "BMW", "iX-2026", 2025, [
  { name: "iX xDrive45", fuelSection: "electric", fuel: null, year: 2025, hp: 408, cc: null, co2w: 0 },
  { name: "iX xDrive60", fuelSection: "electric", fuel: null, year: 2025, hp: 544, cc: null, co2w: 0 },
]);
// BMW Série 3 — G20 (320d + M340i) para o M-trim; F30 mais antigo
model("F30", "BMW", "F30-3-Series", null, [
  { name: "F30 320d", fuelSection: "diesel", fuel: "Diesel", year: 2012, hp: 184, cc: 1995, co2n: 120 },
]);
model("G20", "BMW", "G20-3-Series", null, [
  { name: "G20 320d", fuelSection: "diesel", fuel: "Diesel", year: 2019, hp: 190, cc: 1995, co2w: 125 },
  { name: "G20 M340i xDrive", fuelSection: "petrol", fuel: "Petrol", year: 2019, hp: 374, cc: 2998, co2w: 178 },
]);
model("G80", "BMW", "G80-M3", null, [
  { name: "G80 M3 Competition", fuelSection: "petrol", fuel: "Petrol", year: 2021, hp: 510, cc: 2993, co2w: 234 },
]);
// VW Golf — gen 8 (2020): 1.5/GTI/GTI Clubsport/R; gen 7 facelift (2017): GTI 230
model("GOLF7", "Volkswagen", "Golf-2017", 2017, [
  { name: "Golf 2.0 TSI GTI Performance 245HP", fuelSection: "petrol", fuel: "Petrol", year: 2017, hp: 245, cc: 1984, co2w: 167 },
  { name: "Golf 2.0 TSI GTI 230HP", fuelSection: "petrol", fuel: "Petrol", year: 2017, hp: 230, cc: 1984, co2w: 148 },
]);
model("GOLF8", "Volkswagen", "Golf-2019", 2020, [
  { name: "Golf 1.5 TSI 150HP", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 150, cc: 1498, co2w: 130 },
  { name: "Golf 2.0 TSI GTI", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 245, cc: 1984, co2w: 168 },
  // gémea da GTI (igual potência/cc) que SÓ o trim curado "clubsport" separa
  { name: "Golf 2.0 TSI GTI Clubsport", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 245, cc: 1984, co2w: 168 },
  { name: "Golf 2.0 TSI R", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 320, cc: 1984, co2w: 195 },
]);
// MINI — F56 (2014 gaso) e J01 (2024 elétrico): gerações distintas de mini-cooper
model("F56", "Mini", "Mini-F56", null, [
  { name: "Mini Cooper S", fuelSection: "petrol", fuel: "Petrol", year: 2014, hp: 192, cc: 1998, co2n: 133 },
  { name: "Mini John Cooper Works", fuelSection: "petrol", fuel: "Petrol", year: 2015, hp: 231, cc: 1998, co2n: 155 },
]);
model("J01", "Mini", "J01-Hatch-Electric", 2024, [
  { name: "J01 Hatch Electric Cooper SE 54.2 kWh", fuelSection: "electric", fuel: null, year: 2024, hp: 218, cc: 54, co2w: 0 },
]);
// MINI F66 (2023) — Cooper S gémea manual/auto: só a CAIXA as separa.
model("F66", "Mini", "Mini-F66", 2023, [
  { name: "Mini Cooper S", fuelSection: "petrol", fuel: "Petrol", year: 2023, hp: 178, cc: 1499, co2w: 150, gearbox: "6 speed Manual" },
  { name: "Mini Cooper S", fuelSection: "petrol", fuel: "Petrol", year: 2023, hp: 178, cc: 1499, co2w: 150, gearbox: "7 speed Automatic" },
]);
// Opel Corsa-F (2020) — 3 vs 5 portas: só o nº de PORTAS as separa.
model("CORSAF", "Opel", "Corsa-F", 2020, [
  { name: "Corsa 1.2", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 100, cc: 1199, co2w: 130, doors: 3 },
  { name: "Corsa 1.2", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 100, cc: 1199, co2w: 130, doors: 5 },
]);
// Skoda Octavia (2020) — 2.0 TDI gémeas com CO₂ distinto: só o CO₂ as separa.
model("OCT", "Skoda", "Octavia-2020", 2020, [
  { name: "Octavia 2.0 TDI", fuelSection: "diesel", fuel: "Diesel", year: 2020, hp: 150, cc: 1968, co2w: 120 },
  { name: "Octavia 2.0 TDI", fuelSection: "diesel", fuel: "Diesel", year: 2020, hp: 150, cc: 1968, co2w: 140 },
]);
// Skoda Superb (2020) — 2.0 TDI NÃO-concordantes (CO₂ a 70 g = carros diferentes):
// os splitters não podem atuar fora de um conjunto concordante.
model("SUPB", "Skoda", "Superb-2020", 2020, [
  { name: "Superb 2.0 TDI", fuelSection: "diesel", fuel: "Diesel", year: 2020, hp: 150, cc: 1968, co2w: 120, gearbox: "6 speed Manual" },
  { name: "Superb 2.0 TDI", fuelSection: "diesel", fuel: "Diesel", year: 2020, hp: 150, cc: 1968, co2w: 190, gearbox: "7 speed Automatic" },
]);
// BYD Dolphin ≠ Dolphin Surf (famílias próprias)
model("DOLPH", "BYD", "Dolphin", 2021, [
  { name: "Dolphin 60 kWh 204HP", fuelSection: "electric", fuel: null, year: 2023, hp: 204, cc: 60, co2w: 0 },
]);
model("SURF", "BYD", "Dolphin-Surf", 2025, [
  { name: "Dolphin Surf Comfort 43.2kWh 156HP", fuelSection: "electric", fuel: null, year: 2025, hp: 156, cc: 43, co2w: 0 },
]);
// Hyundai Kona (Kauai) — 1.0 gaso + elétrico
model("KONA", "Hyundai", "Kona", null, [
  { name: "Kona 1.0 T-GDI", fuelSection: "petrol", fuel: "Petrol", year: 2018, hp: 120, cc: 998, co2w: 127 },
  { name: "Kona Electric 64kWh", fuelSection: "electric", fuel: null, year: 2018, hp: 204, cc: 64, co2w: 0 },
]);
// Hyundai Grand Santa Fe — família fallback "grand" (guarda anti-fallback)
model("GRAND", "Hyundai", "Grand-Santa-Fe", 2014, [
  { name: "Grand Santa Fe 2.2 CRDi", fuelSection: "diesel", fuel: "Diesel", year: 2014, hp: 197, cc: 2199, co2n: 178 },
]);

// ── Derivados de modelo/carroçaria (guarda pós-auditoria) ─────────
// Toyota Corolla: Cross (SUV) + Hatchback + Touring Sports na MESMA geração e SEM
// base "corolla" nu → sem token no anúncio é derivadoAmbiguo (nunca confirma).
model("CORX", "Toyota", "Corolla-Cross", 2022, [
  { name: "Corolla Cross 1.8 Hybrid", fuelSection: "petrol", fuel: "Hybrid / Petrol", year: 2022, hp: 140, cc: 1798, co2w: 112 },
]);
model("CORH", "Toyota", "Corolla-E210-Hatchback-2023", 2023, [
  { name: "Corolla Hatchback 1.8 Hybrid", fuelSection: "petrol", fuel: "Hybrid / Petrol", year: 2023, hp: 140, cc: 1798, co2w: 108 },
]);
model("CORT", "Toyota", "Corolla-E210-Touring-Sports-2023", 2023, [
  { name: "Corolla Touring Sports 1.8 Hybrid", fuelSection: "petrol", fuel: "Hybrid / Petrol", year: 2023, hp: 140, cc: 1798, co2w: 110 },
]);
// Land Rover Defender 90 vs 110 (números, não carroçaria) sem base → ambíguo.
model("DEF90", "Land Rover", "Defender-90-2026", 2025, [
  { name: "Defender 90 D200", fuelSection: "diesel", fuel: "Diesel", year: 2025, hp: 200, cc: 2997, co2w: 222 },
]);
model("DEF110", "Land Rover", "Defender-110-2026", 2025, [
  { name: "Defender 110 D200", fuelSection: "diesel", fuel: "Diesel", year: 2025, hp: 200, cc: 2997, co2w: 222 },
]);
// VW T-Roc: SUV base + Cabrio (mesma geração) → sem "cabrio" no texto fica a base.
model("TROC", "Volkswagen", "T-Roc", 2017, [
  { name: "T-Roc 1.5 TSI 150HP", fuelSection: "petrol", fuel: "Petrol", year: 2017, hp: 150, cc: 1498, co2w: 137 },
]);
model("TROCCAB", "Volkswagen", "T-Roc-Cabrio", null, [
  { name: "T-Roc Cabrio 1.5 TSI 150HP", fuelSection: "petrol", fuel: "Petrol", year: 2018, hp: 150, cc: 1498, co2w: 141 },
]);
// Audi TT Coupe/Roadster: carroçarias da MESMA designação sem base → NÃO demove,
// mas sobrevivem 2 versões gémeas → DESIGNACAO (motor provado, variante não única).
model("TTC", "Audi", "TT-Coupe", 2016, [
  { name: "TT 2.0 TFSI Coupe", fuelSection: "petrol", fuel: "Petrol", year: 2016, hp: 230, cc: 1984, co2w: 145 },
]);
model("TTR", "Audi", "TT-Roadster", 2016, [
  { name: "TT 2.0 TFSI Roadster", fuelSection: "petrol", fuel: "Petrol", year: 2016, hp: 230, cc: 1984, co2w: 149 },
]);
// BMW X3: G01 (2017, 190cv) e G45 (2024, 197cv) — janelas disjuntas.
model("X3G01", "BMW", "G01-X3", 2017, [
  { name: "X3 xDrive20d", fuelSection: "diesel", fuel: "Diesel", year: 2018, hp: 190, cc: 1995, co2w: 150 },
]);
model("X3G45", "BMW", "G45-X3", 2024, [
  { name: "X3 20d xDrive Steptronic", fuelSection: "diesel", fuel: "Diesel", year: 2024, hp: 197, cc: 1995, co2w: 153 },
]);
// Seat Ateca pré-facelift (2016) vs facelift Ateca-2020 — janelas disjuntas.
model("ATC", "Seat", "Ateca", 2016, [
  { name: "Ateca 1.5 EcoTSI", fuelSection: "petrol", fuel: "Petrol", year: 2016, hp: 150, cc: 1498, co2w: 151 },
]);
model("ATC20", "Seat", "Ateca-2020", 2020, [
  { name: "Ateca 1.5 TSI 150HP ACT DSG", fuelSection: "petrol", fuel: "Petrol", year: 2020, hp: 150, cc: 1498, co2w: 144 },
]);
// Porsche 928: S4 (320) e GT (330) na mesma geração/mid — degrau exato.
model("P928", "Porsche", "928", null, [
  { name: "928 S4", fuelSection: "petrol", fuel: "Petrol", year: 1987, hp: 320, cc: 4957 },
  { name: "928 GT", fuelSection: "petrol", fuel: "Petrol", year: 1989, hp: 330, cc: 4957 },
]);

const CAT: UsCatalogIndex = buildIndex(models, versions);

// ── helper de input ──
function inp(p: Partial<ResolveInput> & { makeRaw: string; modelRaw: string }): ResolveInput {
  return {
    makeRaw: p.makeRaw, modelRaw: p.modelRaw, variant: p.variant ?? null, fuelRaw: p.fuelRaw ?? null,
    year: p.year ?? null, powerHp: p.powerHp ?? null, displacementCc: p.displacementCc ?? null, co2: p.co2 ?? null,
    gearbox: p.gearbox ?? null, doors: p.doors ?? null, engineCode: p.engineCode ?? null,
  };
}
/** versão do resultado (exato/provavel); undefined para designacao/null. */
const vspec = (r: MatchResult | null) =>
  r && r.kind !== "designacao"
    ? [...CAT.byFamily.values()].flatMap((f) => f.versions).find((v) => v.versionId === r.versionId)
    : undefined;

// ════════════════════════════════════════════════════════════════
// 1. Casos de produto (CI, sem BD)
// ════════════════════════════════════════════════════════════════

test("840i ≠ M850i ≠ M8 — a potência separa as designações", () => {
  const d840 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 SERIES", variant: "840D 3.0 320 XDRIVE", fuelRaw: "Diesel", year: 2019, powerHp: 320, displacementCc: 3000 }), CAT);
  assert.equal(d840?.kind, "exato");
  assert.equal(vspec(d840)?.powerHp, 320);

  const i840 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 SERIES", variant: "840i xDrive", fuelRaw: "Gasolina", year: 2020, powerHp: 333, displacementCc: 2998 }), CAT);
  assert.equal(i840?.kind, "exato");
  assert.ok((vspec(i840)?.powerHp ?? 0) <= 340, "840i não é M850i/M8");

  // M850i escrito como modelo (olx) — o M-trim mapeia para serie-8
  const m850 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "M850i", variant: "xDrive", fuelRaw: "Gasolina", year: 2019, powerHp: 530, displacementCc: 4395 }), CAT);
  assert.equal(m850?.kind, "exato");
  assert.equal(vspec(m850)?.powerHp, 530);

  // M8 (600) e M8 Competition (625) estão 25cv à parte → ambíguos → null (nunca
  // confunde com 840i/M850i, que é o que o caso de produto exige)
  const m8 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 Series", variant: "M8 Competition", fuelRaw: "Gasolina", year: 2019, powerHp: 625, displacementCc: 4395 }), CAT);
  assert.ok(m8 === null || (vspec(m8)?.powerHp ?? 0) >= 600, "M8 nunca resolve para 840i/M850i");
});

test("iX xDrive40 (326) ≠ xDrive45 (408) — gerações e potências distintas", () => {
  const x40 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "iX", variant: "xDrive40", fuelRaw: "Elektro", year: 2023, powerHp: 326 }), CAT);
  assert.equal(x40?.kind, "exato");
  assert.equal(vspec(x40)?.powerHp, 326);
  const x45 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "iX", variant: "xDrive45", fuelRaw: "Electrico", year: 2025, powerHp: 408 }), CAT);
  assert.equal(x45?.kind, "exato");
  assert.equal(vspec(x45)?.powerHp, 408);
});

test("M340i escrito como modelo → serie-3 (não m3); M3 puro fica m3", () => {
  const m340 = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "M340i", variant: "xDrive", fuelRaw: "Gasolina", year: 2020, powerHp: 374, displacementCc: 2998 }), CAT);
  assert.equal(m340?.evidence.family, "bmw|serie-3");
  assert.equal(m340?.kind, "exato");
});

test("Golf GTI 245 ≠ R 320 ≠ 1.5 150 (GTI vs Clubsport separadas pelo trim)", () => {
  const gti = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf VIII", variant: "2.0 TSI GTI", fuelRaw: "Benzin", year: 2021, powerHp: 245, displacementCc: 1984, co2: 168 }), CAT);
  assert.equal(gti?.kind, "exato");
  assert.equal(vspec(gti)?.powerHp, 245);
  assert.equal(vspec(gti)?.tokens.includes("clubsport"), false); // é a GTI pura
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "2.0 TSI R", fuelRaw: "Gasolina", year: 2021, powerHp: 320, displacementCc: 1984 }), CAT);
  assert.equal(vspec(r)?.powerHp, 320);
  const base = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "1.5 TSI", fuelRaw: "Benzin", year: 2021, powerHp: 150, displacementCc: 1498 }), CAT);
  assert.equal(vspec(base)?.powerHp, 150);
});

test("Golf GTI 245 no ano-fronteira 2017 → exato (pré-facelift 245)", () => {
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "2.0 TSI GTI Performance", fuelRaw: "Benzin", year: 2017, powerHp: 245, displacementCc: 1984, co2: 167 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(vspec(r)?.powerHp, 245);
});

test("MINI F56 (Cooper S 192, 2016) ≠ J01 (elétrico 2024) — gerações separadas por ano", () => {
  const s = resolveVersion(inp({ makeRaw: "MINI", modelRaw: "Mini", variant: "Cooper S", fuelRaw: "Benzin", year: 2016, powerHp: 192, displacementCc: 1998 }), CAT);
  assert.equal(s?.kind, "exato");
  assert.equal(vspec(s)?.powerHp, 192);
  // elétrico 2024 nunca casa o F56 térmico
  const e = resolveVersion(inp({ makeRaw: "MINI", modelRaw: "Mini", variant: "Cooper SE", fuelRaw: "Electrico", year: 2024, powerHp: 218 }), CAT);
  assert.equal(vspec(e)?.fuel, "elétrico");
  assert.equal(vspec(e)?.powerHp, 218);
});

test("BYD Dolphin 204 ≠ Dolphin Surf (família própria)", () => {
  const d = resolveVersion(inp({ makeRaw: "BYD", modelRaw: "DOLPHIN", variant: "Comfort", fuelRaw: "Electrico", year: 2025, powerHp: 204 }), CAT);
  assert.equal(d?.evidence.family, "byd|dolphin");
  const surf = resolveVersion(inp({ makeRaw: "BYD", modelRaw: "DOLPHIN SURF", variant: "Comfort", fuelRaw: "Electrico", year: 2025, powerHp: 156 }), CAT);
  assert.equal(surf?.evidence.family, "byd|dolphin-surf");
});

test("Kauai → Kona; elétrico nunca casa térmico", () => {
  const k = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Kauai", variant: "1.0 T-GDi", fuelRaw: "Gasolina", year: 2019, powerHp: 120, displacementCc: 998 }), CAT);
  assert.equal(k?.evidence.family, "hyundai|kona");
  assert.equal(vspec(k)?.fuel, "gasolina");
  const ev = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Kona", variant: "EV", fuelRaw: "Elektro", year: 2020, powerHp: 204 }), CAT);
  assert.equal(vspec(ev)?.fuel, "elétrico");
});

test("guarda anti-fallback: Grand i10 NÃO casa Grand Santa Fe", () => {
  // Grand Santa Fe real → exato (tokens do modelo contidos no slug)
  const gsf = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Grand Santa Fe", variant: "2.2 CRDi", fuelRaw: "Diesel", year: 2015, powerHp: 197, displacementCc: 2199 }), CAT);
  assert.equal(gsf?.evidence.family, "hyundai|grand");
  // Grand i10 → mesma família fallback "grand", mas tokens ["grand","i10"] não
  // cabem no slug ["grand","santa","fe"] → null (e a potência também não bate)
  const gi10 = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Grand i10", variant: "1.0", fuelRaw: "Gasolina", year: 2018, powerHp: 67, displacementCc: 998 }), CAT);
  assert.equal(gi10, null);
});

test("GPL/CNG → sempre null (fuel fora do âmbito)", () => {
  const r = resolveVersion(inp({ makeRaw: "Renault", modelRaw: "Clio", variant: "TCe 100 Bi-Fuel", fuelRaw: "LPG", year: 2024, powerHp: 100, displacementCc: 999 }), CAT);
  assert.equal(r, null);
});

test("0 sinais duros nunca casa (mesmo com candidato único)", () => {
  // Grand Santa Fe é a única versão da família, mas sem potência/cc/badge → null
  const r = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Grand Santa Fe", variant: "CRDi", fuelRaw: "Diesel", year: 2015 }), CAT);
  assert.equal(r, null);
});

test("ano ausente impede exato E designacao (no máximo provavel)", () => {
  const r = resolveVersion(inp({ makeRaw: "MINI", modelRaw: "Mini", variant: "Cooper S", fuelRaw: "Benzin", year: null, powerHp: 192, displacementCc: 1998 }), CAT);
  assert.notEqual(r?.kind, "exato");
  assert.notEqual(r?.kind, "designacao");
});

test("determinismo: 2 runs = mesmo resultado byte-a-byte", () => {
  const i = inp({ makeRaw: "BMW", modelRaw: "8 SERIES", variant: "840i xDrive", fuelRaw: "Gasolina", year: 2020, powerHp: 333, displacementCc: 2998 });
  assert.deepEqual(resolveVersion(i, CAT), resolveVersion(i, CAT));
});

// ── Fuel: igualdade exata e nunca cross-fuel ─────────────────────

test("fuel: gasolina nunca casa a versão diesel de igual potência", () => {
  // 840d (320 diesel) e um hipotético gasolina de 320 não existe; um anúncio
  // gasolina 320 na serie-8 não pode cair no 840d diesel.
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 Series", variant: "840", fuelRaw: "Gasolina", year: 2019, powerHp: 320, displacementCc: 2993 }), CAT);
  if (r) assert.notEqual(vspec(r)?.fuel, "diesel");
});

test("fuel: phev só casa phev; híbrido só casa híbrido (HEV≠PHEV)", () => {
  // O catálogo sintético não tem PHEV Golf → anúncio phev → null (nunca cai no híbrido/gasolina)
  const phev = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "GTE Plug-in", fuelRaw: "Plug-in Hybrid", year: 2021, powerHp: 245, displacementCc: 1395 }), CAT);
  assert.equal(phev, null);
});

test("fuel: elétrico nunca casa térmico e vice-versa", () => {
  // iX (elétrico) com um anúncio marcado gasolina → null
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "iX", variant: "xDrive40", fuelRaw: "Gasolina", year: 2023, powerHp: 326 }), CAT);
  assert.equal(r, null);
});

// ── Tiers: provavel e null ───────────────────────────────────────

test("provavel: 1 sinal duro (potência) + candidato único, sem 2.º sinal", () => {
  // Kona elétrico 204: EV sem cc, badge "ev" não bate tokens → só potência
  const r = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Kona", variant: "EV", fuelRaw: "Elektro", year: 2020, powerHp: 204 }), CAT);
  assert.equal(r?.kind, "provavel");
  assert.equal(r?.evidence.hardSignals, 1);
});

test("null: potência presente mas nenhuma versão bate (não inventa)", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 Series", variant: "840i", fuelRaw: "Gasolina", year: 2020, powerHp: 999, displacementCc: 2998 }), CAT);
  assert.equal(r, null);
});

test("null: família fora do catálogo (modelo desconhecido)", () => {
  const r = resolveVersion(inp({ makeRaw: "Porsche", modelRaw: "System", variant: "Porshe", fuelRaw: "Gasolina", year: 2005 }), CAT);
  assert.equal(r, null);
});

// ── Cilindrada: litragem↔cc e cc↔cc ──────────────────────────────

test("cilindrada: litragem da variante (2.0) casa cc do catálogo (1984)", () => {
  // Golf GTI 245 sem cc estruturado, mas variante "2.0 TSI" → litros 2.0 ↔ 1984cc
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf VIII", variant: "2.0 TSI GTI", fuelRaw: "Benzin", year: 2021, powerHp: 245 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.signals.displacementL, 2);
});

test("cilindrada: cc do anúncio dentro de ±30 do catálogo", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 Series", variant: "840i", fuelRaw: "Gasolina", year: 2020, powerHp: 333, displacementCc: 2970 }), CAT);
  assert.equal(r?.kind, "exato"); // 2970 vs 2998 = 28 ≤ 30
});

// ── Potência do texto (não confundir com litragem) ───────────────

test("potência do texto: '840D 3.0 320' extrai 320 (não a litragem 3.0)", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 SERIES", variant: "840D 3.0 320 XDRIVE", fuelRaw: "Diesel", year: 2019, displacementCc: 2993 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.signals.powerHp, 320);
});

// ── Badges ───────────────────────────────────────────────────────

test("badge concatenado: 'xDrive 45' (com espaço) → xdrive45 casa o token", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "iX", variant: "xDrive 45", fuelRaw: "Electrico", year: 2025, powerHp: 408 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.deepEqual(r?.evidence.signals.badges, ["xdrive45"]);
});

test("badge forte conta como 2.º sinal nos elétricos (potência+badge)", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "iX", variant: "xDrive40", fuelRaw: "Elektro", year: 2023, powerHp: 326 }), CAT);
  assert.equal(r?.evidence.hardSignals, 2);
});

// ── Splitters de gémeos: exato vs designacao ─────────────────────

test("splitter gearbox: Cooper S auto vs manual — com caixa → exato, sem → designacao", () => {
  // com a caixa no anúncio, o splitter separa as gémeas → exato + splitters.
  const auto = resolveVersion(inp({ makeRaw: "MINI", modelRaw: "Mini", variant: "Cooper S", fuelRaw: "Benzin", year: 2023, powerHp: 178, displacementCc: 1499, gearbox: "Automatik" }), CAT);
  assert.equal(auto?.kind, "exato");
  assert.ok(auto?.evidence.splitters?.includes("gearbox"));
  assert.equal(vspec(auto)?.gearbox, "auto");

  // sem caixa, ficam 2 gémeas → designacao com factos corretos.
  const sem = resolveVersion(inp({ makeRaw: "MINI", modelRaw: "Mini", variant: "Cooper S", fuelRaw: "Benzin", year: 2023, powerHp: 178, displacementCc: 1499 }), CAT);
  assert.equal(sem?.kind, "designacao");
  if (sem?.kind === "designacao") {
    assert.equal(sem.facts.versions, 2);
    assert.equal(sem.facts.powerHp, 178);
    assert.equal(sem.facts.displacementCc, 1499);
    assert.equal(sem.facts.co2Wltp, 150);
    assert.equal(sem.facts.mid, "F66");
    assert.deepEqual(sem.facts.genWindow, { start: 2023, end: null });
  }
});

test("splitter trimset: 'GTI' escolhe a GTI pura, não a GTI Clubsport", () => {
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "2.0 TSI GTI", fuelRaw: "Benzin", year: 2021, powerHp: 245, displacementCc: 1984 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.deepEqual(r?.evidence.splitters, ["trimset"]);
  assert.equal(vspec(r)?.tokens.includes("clubsport"), false);
});

test("splitter trimset: 'Clubsport' no anúncio escolhe a Clubsport", () => {
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "2.0 TSI GTI Clubsport", fuelRaw: "Benzin", year: 2021, powerHp: 245, displacementCc: 1984 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(vspec(r)?.tokens.includes("clubsport"), true);
});

test("R-Line não é Golf R: o 'r-line' colapsa e 'r' não está na whitelist", () => {
  // Anúncio Golf "R-Line" 1.5 150 — o trim cosmético não pode virar exato no Golf
  // R (320). A potência já o leva à 1.5, mas o ponto é: nunca o R.
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf R-Line", variant: "1.5 TSI", fuelRaw: "Benzin", year: 2021, powerHp: 150, displacementCc: 1498 }), CAT);
  assert.equal(vspec(r)?.powerHp, 150); // a 1.5, jamais o R (320)
  assert.notEqual(vspec(r)?.tokens.includes("r"), true);
});

test("splitter doors: 3p vs 5p — com portas → exato; portas inexistentes → soft-skip", () => {
  const p3 = resolveVersion(inp({ makeRaw: "Opel", modelRaw: "Corsa", variant: "1.2", fuelRaw: "Benzin", year: 2021, powerHp: 100, displacementCc: 1199, doors: 3 }), CAT);
  assert.equal(p3?.kind, "exato");
  assert.ok(p3?.evidence.splitters?.includes("doors"));
  assert.equal(vspec(p3)?.doors, 3);

  // portas que nenhum candidato tem → o splitter não atua e NÃO mata o match.
  const p7 = resolveVersion(inp({ makeRaw: "Opel", modelRaw: "Corsa", variant: "1.2", fuelRaw: "Benzin", year: 2021, powerHp: 100, displacementCc: 1199, doors: 7 }), CAT);
  assert.equal(p7?.kind, "designacao");
  if (p7?.kind === "designacao") assert.equal(p7.facts.versions, 2);
});

test("splitter co2: gémeos com CO₂ distinto — próximo → exato; a >10 g → designacao", () => {
  const perto = resolveVersion(inp({ makeRaw: "Skoda", modelRaw: "Octavia", variant: "2.0 TDI", fuelRaw: "Diesel", year: 2020, powerHp: 150, displacementCc: 1968, co2: 118 }), CAT);
  assert.equal(perto?.kind, "exato");
  assert.ok(perto?.evidence.splitters?.includes("co2"));
  assert.equal(vspec(perto)?.co2Wltp, 120);

  // co2 a >10 g de ambos → não atua (o anúncio pode estar na norma errada).
  const longe = resolveVersion(inp({ makeRaw: "Skoda", modelRaw: "Octavia", variant: "2.0 TDI", fuelRaw: "Diesel", year: 2020, powerHp: 150, displacementCc: 1968, co2: 200 }), CAT);
  assert.equal(longe?.kind, "designacao");
  if (longe?.kind === "designacao") assert.equal(longe.facts.co2Wltp, 120); // mediana-baixa de [120,140]
});

test("splitters só atuam em conjunto CONCORDANTE: não promovem carros diferentes a exato", () => {
  // Superb 2.0 TDI com CO₂ a 70 g (não-concordantes = carros materialmente
  // diferentes). A caixa do anúncio NÃO pode escolher um e promover a exato —
  // sem concordância o resultado fica null (2 versões, sem candidato único).
  const r = resolveVersion(inp({ makeRaw: "Skoda", modelRaw: "Superb", variant: "2.0 TDI", fuelRaw: "Diesel", year: 2020, powerHp: 150, displacementCc: 1968, gearbox: "Automatic" }), CAT);
  assert.notEqual(r?.kind, "exato");
  assert.notEqual(r?.kind, "designacao");
});

test("splitter gearbox errado (nenhum candidato bate) → não atua, não mata o match", () => {
  // caixa "semi" é ambígua (normGearbox → null) → o splitter não atua → designacao.
  const r = resolveVersion(inp({ makeRaw: "MINI", modelRaw: "Mini", variant: "Cooper S", fuelRaw: "Benzin", year: 2023, powerHp: 178, displacementCc: 1499, gearbox: "Semi-automatic" }), CAT);
  assert.equal(r?.kind, "designacao");
});

test("exato ⇒ mid é sempre string (versão única ⇒ geração única)", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 SERIES", variant: "840i xDrive", fuelRaw: "Gasolina", year: 2020, powerHp: 333, displacementCc: 2998 }), CAT);
  assert.equal(r?.kind, "exato");
  if (r?.kind === "exato") assert.equal(typeof r.mid, "string");
});

// ── Flags de evidência ───────────────────────────────────────────

test("trimAmbiguo: 840i com potência mais próxima resolve à versão exata (single)", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 Series", variant: "840i", fuelRaw: "Gasolina", year: 2020, powerHp: 333, displacementCc: 2998 }), CAT);
  assert.equal(r?.kind, "exato"); // a preferência de degrau deixa 1 versão (333)
  assert.equal(r?.evidence.candidates, 1);
});

test("evidence: família e fuel corretos na evidência", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 SERIES", variant: "840i", fuelRaw: "Gasolina", year: 2020, powerHp: 333, displacementCc: 2998 }), CAT);
  assert.equal(r?.evidence.family, "bmw|serie-8");
  assert.equal(r?.evidence.fuel, "gasolina");
});

// ── Janela de geração ────────────────────────────────────────────

test("geração: anúncio 2020 não casa o clássico E31 (1993) da mesma família", () => {
  // Um 840 gasolina 2020 (333cv) fica no G15; jamais no E31 (286cv, fora da janela)
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "8 Series", variant: "840i", fuelRaw: "Gasolina", year: 2020, powerHp: 286, displacementCc: 3982 }), CAT);
  // 286cv só existe no E31 (janela ~1993) → 2020 fora da janela → null
  assert.equal(r, null);
});

test("iX ≠ iX3 (famílias distintas): modelo iX3 não resolve na família ix", () => {
  // O catálogo sintético não tem iX3 → um anúncio iX3 dá null (não cai no iX)
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "iX3", variant: "Impressive", fuelRaw: "Elektro", year: 2022, powerHp: 286 }), CAT);
  assert.equal(r, null);
});

// ── Refinamentos Fase 3 ──────────────────────────────────────────

test("refinamento (a): badge igual ao slug da família não conta como sinal duro", () => {
  // "M3" gera badge "m3" == família "m3" (nome do modelo repetido), não uma
  // designação de trim/motor. Com potência + cc há 2 sinais REAIS → exato,
  // mas o badge não pode inflar a contagem.
  const full = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "M3", variant: "Competition", fuelRaw: "Gasolina", year: 2021, powerHp: 510, displacementCc: 2993 }), CAT);
  assert.equal(full?.evidence.family, "bmw|m3");
  assert.equal(full?.kind, "exato");
  assert.equal(full?.evidence.signals.badges, undefined); // "m3" não entra como badge
  assert.equal(full?.evidence.hardSignals, 2); // potência + cc (badge NÃO soma)
  // Só com potência (sem cc), o badge "m3" já não salva o 2.º sinal → provavel.
  const powerOnly = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "M3", variant: "Competition", fuelRaw: "Gasolina", year: 2021, powerHp: 510 }), CAT);
  assert.equal(powerOnly?.kind, "provavel");
  assert.equal(powerOnly?.evidence.hardSignals, 1);
});

test("refinamento (b): litragem apanha letra colada (1.6d/2.0T) sem falsos", () => {
  assert.equal(litersFromVariant("1.6d"), 1.6);
  assert.equal(litersFromVariant("2.0T"), 2.0);
  assert.equal(litersFromVariant("2.0 TSI"), 2.0); // espaço continua a funcionar
  assert.equal(litersFromVariant("versão 1.6"), 1.6);
  assert.equal(litersFromVariant("R1250 GS"), null); // sem separador → não é 1.2
  assert.equal(litersFromVariant("1500"), null); // sem separador
  assert.equal(litersFromVariant("1.55"), null); // dígito extra veta (não é litragem)
  // Ponta-a-ponta: "1.5T" (T colado) dá o 2.º sinal e confirma o Golf 1.5 150.
  const golf = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "Golf", variant: "1.5T", fuelRaw: "Benzin", year: 2021, powerHp: 150 }), CAT);
  assert.equal(golf?.kind, "exato");
  assert.equal(golf?.evidence.signals.displacementL, 1.5);
});

test("viaFallback: Grand Santa Fe legítimo confirma (tokens contidos no slug)", () => {
  const r = resolveVersion(inp({ makeRaw: "Hyundai", modelRaw: "Grand Santa Fe", variant: "2.2 CRDi", fuelRaw: "Diesel", year: 2015, powerHp: 197, displacementCc: 2199 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.viaFallback, true);
});

// ── Guarda de derivados de modelo/carroçaria (pós-auditoria) ──────

test("derivados: Corolla sem corpo no texto → hatch BASE (não o Cross, modelo derivado)", () => {
  // hatchback é carroçaria neutra → o mid do hatch é a base; o Cross (SUV) é um
  // derivado de modelo que só sobrevive se o anúncio o nomear.
  const r = resolveVersion(inp({ makeRaw: "Toyota", modelRaw: "Corolla", variant: "1.8 Hybrid", fuelRaw: "Elektro/Benzin", year: 2025, powerHp: 140, displacementCc: 1798, co2: 106 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.derivadoAmbiguo, false);
  assert.equal(vspec(r)?.tokens.includes("cross"), false);
});

test("derivados: anúncio que nomeia 'Cross' → confirma o Cross (sem ambiguidade)", () => {
  const r = resolveVersion(inp({ makeRaw: "Toyota", modelRaw: "Corolla Cross", variant: "1.8 Hybrid", fuelRaw: "Elektro/Benzin", year: 2025, powerHp: 140, displacementCc: 1798, co2: 106 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.derivadoAmbiguo, false);
  assert.equal(vspec(r)?.tokens.includes("cross"), true);
});

test("derivados: Defender 90 vs 110 sem token (números ≠ carroçaria) → provavel derivadoAmbiguo (nunca designacao)", () => {
  const r = resolveVersion(inp({ makeRaw: "Land Rover", modelRaw: "Defender", variant: "D200", fuelRaw: "Diesel", year: 2025, powerHp: 200, displacementCc: 2993, co2: 220 }), CAT);
  assert.equal(r?.kind, "provavel");
  assert.equal(r?.evidence.derivadoAmbiguo, true);
});

test("derivados: Defender com '90' no texto → confirma o 90", () => {
  const r = resolveVersion(inp({ makeRaw: "Land Rover", modelRaw: "Defender 90", variant: "D200", fuelRaw: "Diesel", year: 2025, powerHp: 200, displacementCc: 2993, co2: 220 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(vspec(r)?.tokens.includes("90"), true);
});

test("derivados: T-Roc sem 'cabrio' no texto → SUV base (não o Cabriolet)", () => {
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "T-Roc", variant: "1.5 TSI Sport", fuelRaw: "Benzin", year: 2018, powerHp: 150, displacementCc: 1498 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.derivadoAmbiguo, false);
  assert.equal(vspec(r)?.tokens.includes("cabrio"), false);
});

test("derivados: T-Roc 'Cabrio' no texto → confirma o Cabriolet", () => {
  const r = resolveVersion(inp({ makeRaw: "Volkswagen", modelRaw: "T-Roc Cabrio", variant: "1.5 TSI", fuelRaw: "Benzin", year: 2018, powerHp: 150, displacementCc: 1498 }), CAT);
  assert.equal(vspec(r)?.tokens.includes("cabrio"), true);
});

test("derivados: carroçarias sem base (TT Coupe/Roadster) → designacao (motor provado, variante não única)", () => {
  // coupe/roadster são a mesma designação em corpos distintos (motor/cc iguais) →
  // trimAmbiguo, não derivadoAmbiguo; sobrevivem 2 versões gémeas → designacao.
  const r = resolveVersion(inp({ makeRaw: "Audi", modelRaw: "TT", variant: "2.0 TFSI", fuelRaw: "Benzin", year: 2016, powerHp: 230, displacementCc: 1984 }), CAT);
  assert.equal(r?.kind, "designacao");
  assert.equal(r?.evidence.derivadoAmbiguo, false);
  if (r?.kind === "designacao") {
    assert.equal(r.facts.versions, 2);
    assert.equal(r.facts.powerHp, 230);
    assert.equal(r.facts.displacementCc, 1984);
    assert.equal(r.evidence.family, "audi|tt");
  }
});

// ── Janelas de geração disjuntas (fronteira sem sobreposição) ─────

test("janela disjunta: X3 20d 2023 190cv → G01 (não vaza para o G45 2024 197cv)", () => {
  const r = resolveVersion(inp({ makeRaw: "BMW", modelRaw: "X3", variant: "20d", fuelRaw: "Diesel", year: 2023, powerHp: 190, displacementCc: 1995 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(vspec(r)?.powerHp, 190);
  assert.equal(r?.evidence.geracaoAmbigua, false);
});

test("janela disjunta: Ateca 2019 → pré-facelift EcoTSI (não o facelift Ateca-2020)", () => {
  const r = resolveVersion(inp({ makeRaw: "Seat", modelRaw: "Ateca", variant: "1.5 TSI ACT", fuelRaw: "Benzin", year: 2019, powerHp: 150, displacementCc: 1498 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(r?.evidence.family, "seat|ateca");
  assert.equal(vspec(r)?.tokens.includes("ecotsi"), true);
});

// ── Preferência de degrau exato (potência mais próxima) ───────────

test("degrau exato: 928 '4S' (token não bate 's4') → S4 320, não GT 330", () => {
  // "4s" ≠ "s4" → o desempate de trim não separa; a potência mais próxima do
  // anúncio (320) escolhe o S4 em vez do GT (330), sem relaxar a tolerância.
  const r = resolveVersion(inp({ makeRaw: "Porsche", modelRaw: "928", variant: "4S", fuelRaw: "Benzin", year: 1987, powerHp: 320, displacementCc: 4957 }), CAT);
  assert.equal(r?.kind, "exato");
  assert.equal(vspec(r)?.powerHp, 320);
});

// ════════════════════════════════════════════════════════════════
// 2. Golden (só com BD docker)
// ════════════════════════════════════════════════════════════════

try {
  process.loadEnvFile(".env.local");
} catch {
  /* sem .env.local → salta */
}
const HAS_DB = !!process.env.DATABASE_URL;

// O CI tem DATABASE_URL (Postgres de serviço) mas o catálogo us_* VAZIO — os
// testes de golden/property precisam do catálogo carregado (docker local).
// Skip dinâmico (tsx compila para CJS: sem top-level await).
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

// Ligação dedicada por teste-BD (o singleton `db` fecha-se uma só vez; dois
// testes a partilhá-lo davam CONNECTION_ENDED no segundo). buildUsCatalog só usa
// db.execute(sql), por isso um drizzle sem schema chega.
async function openDb() {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(process.env.DATABASE_URL as string, { prepare: false });
  return { db: drizzle(client) as unknown as typeof import("../../db").db, close: () => client.end({ timeout: 5 }) };
}

interface GoldenEntry {
  source_site: string; listing_id: string;
  input: ResolveInput;
  label:
    | { kind: "null"; reason: string }
    | { kind: "signature"; family: string; fuel: string; powerHp: number | null; cc: number | null; mustConfirm?: boolean; midEsperado?: string };
  note: string;
}

test(
  "golden: precisão de exato/designacao = 100% e cobertura mínima",
  { skip: !HAS_DB && "sem DATABASE_URL (BD docker)" },
  async (t) => {
    if (await catalogoVazio()) return t.skip(AVISO_CI);
    const { buildUsCatalog } = await import("../../lib/engine/us-catalog");
    const { db, close } = await openDb();
    const cat = await buildUsCatalog(db);
    const golden = JSON.parse(readFileSync("tests/fixtures/golden-matches.json", "utf8")) as GoldenEntry[];

    const versionById = new Map<string, { family: string; powerHp: number | null; displacementCc: number | null; fuel: string }>();
    for (const [key, f] of cat.byFamily) for (const v of f.versions) versionById.set(v.versionId, { family: key, powerHp: v.powerHp, displacementCc: v.displacementCc, fuel: v.fuel });

    const tiers = { exato: 0, designacao: 0, provavel: 0, null: 0 };
    const violations: string[] = [];

    // Tolerâncias (agnósticas ao tier): usadas para exato (sobre a versão) e para
    // designacao (sobre os factos medianos) por igual.
    const powerOk = (got: number | null, want: number | null): boolean =>
      want == null || got == null || Math.abs(got - want) <= Math.max(15, Math.round(want * 0.06));
    const ccOk = (got: number | null, want: number | null): boolean =>
      want == null || got == null || Math.abs(got - want) <= 50;

    for (const e of golden) {
      const r = resolveVersion(e.input, cat);
      const tier = r?.kind ?? "null";
      tiers[tier]++;

      if (e.label.kind === "null") {
        // Negativo: nunca pode ser exato NEM designacao (afirmações fortes).
        if (r && (r.kind === "exato" || r.kind === "designacao"))
          violations.push(`${e.listing_id} [${e.note}]: esperava sem-afirmação, veio ${r.kind}`);
        continue;
      }
      const lab = e.label;
      if (r?.kind === "exato") {
        const v = versionById.get(r.versionId)!;
        if (r.evidence.family !== lab.family) violations.push(`${e.listing_id} [${e.note}]: família ${r.evidence.family} ≠ esperada ${lab.family}`);
        if (v.fuel !== lab.fuel) violations.push(`${e.listing_id} [${e.note}]: fuel ${v.fuel} ≠ ${lab.fuel} (cross-fuel!)`);
        if (!powerOk(v.powerHp, lab.powerHp)) violations.push(`${e.listing_id} [${e.note}]: potência ${v.powerHp} fora de ${lab.powerHp}`);
        if (!ccOk(v.displacementCc, lab.cc)) violations.push(`${e.listing_id} [${e.note}]: cc ${v.displacementCc} ≠ ${lab.cc}±50`);
        if (lab.midEsperado && r.mid !== lab.midEsperado) violations.push(`${e.listing_id} [${e.note}]: mid ${r.mid} ≠ ${lab.midEsperado}`);
      } else if (r?.kind === "designacao") {
        if (r.evidence.family !== lab.family) violations.push(`${e.listing_id} [${e.note}]: família ${r.evidence.family} ≠ esperada ${lab.family}`);
        if (r.evidence.fuel !== lab.fuel) violations.push(`${e.listing_id} [${e.note}]: fuel ${r.evidence.fuel} ≠ ${lab.fuel} (cross-fuel!)`);
        if (!powerOk(r.facts.powerHp, lab.powerHp)) violations.push(`${e.listing_id} [${e.note}]: potência (factos) ${r.facts.powerHp} fora de ${lab.powerHp}`);
        if (!ccOk(r.facts.displacementCc, lab.cc)) violations.push(`${e.listing_id} [${e.note}]: cc (factos) ${r.facts.displacementCc} ≠ ${lab.cc}±50`);
        // mid dos factos só quando fixável (senão null é legítimo).
        if (lab.midEsperado && r.facts.mid != null && r.facts.mid !== lab.midEsperado) violations.push(`${e.listing_id} [${e.note}]: mid (factos) ${r.facts.mid} ≠ ${lab.midEsperado}`);
      }
      if (lab.mustConfirm && !(r?.kind === "exato" || r?.kind === "designacao")) violations.push(`${e.listing_id} [${e.note}]: mustConfirm mas veio ${tier}`);
    }

    console.log(`\n[golden] n=${golden.length} tiers=${JSON.stringify(tiers)} violações=${violations.length}`);
    if (violations.length) console.log(violations.slice(0, 40).join("\n"));
    assert.equal(violations.length, 0, "precisão de exato/designacao tem de ser 100%");
    // Cobertura mínima (realista para dados reais): as afirmações fortes
    // (exato+designacao) são caras (2 sinais + ano), por isso a fatia grande é
    // provavel/null.
    assert.ok(tiers.exato + tiers.designacao >= 40, `poucas afirmações fortes: ${tiers.exato + tiers.designacao}`);
    assert.ok(tiers.exato + tiers.designacao + tiers.provavel >= 90, `pouca cobertura com match: ${tiers.exato + tiers.designacao + tiers.provavel}`);

    await close();
  },
);

// ════════════════════════════════════════════════════════════════
// 3. Property (só com BD docker) — invariantes sobre os 22k
// ════════════════════════════════════════════════════════════════

test(
  "property: invariantes do resolver sobre todos os listings ativos",
  { skip: !HAS_DB && "sem DATABASE_URL (BD docker)" },
  async (t) => {
    if (await catalogoVazio()) return t.skip(AVISO_CI);
    const { sql } = await import("drizzle-orm");
    const { buildUsCatalog } = await import("../../lib/engine/us-catalog");
    const { db, close } = await openDb();
    const cat = await buildUsCatalog(db);
    const genById = new Map<string, { yearStart: number | null; yearEnd: number | null }>();
    for (const f of cat.byFamily.values()) for (const g of f.generations) genById.set(g.id, { yearStart: g.yearStart, yearEnd: g.yearEnd });
    const versionById = new Map<string, { fuel: string; generationId: string }>();
    for (const f of cat.byFamily.values()) for (const v of f.versions) versionById.set(v.versionId, { fuel: v.fuel, generationId: v.generationId });

    const rows = (await db.execute(sql`
      select id::text, source_site, make_raw as "makeRaw", model_raw as "modelRaw", variant,
             fuel_raw as "fuelRaw", year, power_hp as "powerHp", displacement_cc as "displacementCc", co2
      from listings where deleted_at is null and make_raw is not null and model_raw is not null
    `)) as unknown as (ResolveInput & { id: string; source_site: string })[];

    const { normFuel } = await import("../../lib/engine/normalize-vehicle");
    type Bucket = { exato: number; designacao: number; provavel: number; null: number };
    const perSource = new Map<string, Bucket>();
    let checked = 0;
    const t0 = Date.now();

    for (const row of rows) {
      const r = resolveVersion(row, cat);
      // determinismo
      assert.deepEqual(resolveVersion(row, cat), r, `não-determinístico em ${row.id}`);
      const bucket = perSource.get(row.source_site) ?? { exato: 0, designacao: 0, provavel: 0, null: 0 };
      bucket[r?.kind ?? "null"]++;
      perSource.set(row.source_site, bucket);
      if (!r) continue;
      checked++;

      if (r.kind === "exato") {
        // mid string + ≥2 sinais duros + ano presente + cross-fuel + ano∈janela.
        assert.equal(typeof r.mid, "string", `exato com mid não-string em ${row.id}`);
        assert.ok(r.evidence.hardSignals >= 2, `exato com <2 sinais em ${row.id}`);
        assert.ok(row.year != null, `exato sem ano em ${row.id}`);
        const v = versionById.get(r.versionId)!;
        assert.equal(v.fuel, normFuel(row.fuelRaw, row.variant, row.co2), `cross-fuel em ${row.id}`);
        const g = genById.get(v.generationId)!;
        const ok = (g.yearStart == null || row.year! >= g.yearStart) && (g.yearEnd == null || row.year! <= g.yearEnd);
        assert.ok(ok, `ano ${row.year} fora da janela [${g.yearStart},${g.yearEnd}] em ${row.id}`);
      } else if (r.kind === "designacao") {
        // ≥2 versões por definição; ano dentro da janela dos factos (quando fixada).
        assert.ok(r.facts.versions >= 2, `designacao com <2 versões em ${row.id}`);
        if (r.facts.genWindow != null && row.year != null) {
          const { start, end } = r.facts.genWindow;
          assert.ok(row.year >= start && (end == null || row.year <= end), `ano ${row.year} fora dos factos [${start},${end}] em ${row.id}`);
        }
      } else {
        // provavel: nunca cross-fuel; ano dentro da janela quando o mid está fixado.
        const v = versionById.get(r.versionId)!;
        assert.equal(v.fuel, normFuel(row.fuelRaw, row.variant, row.co2), `cross-fuel em ${row.id}`);
        if (row.year != null && r.mid != null) {
          const g = genById.get(v.generationId)!;
          const ok = (g.yearStart == null || row.year >= g.yearStart) && (g.yearEnd == null || row.year <= g.yearEnd);
          assert.ok(ok, `ano ${row.year} fora da janela [${g.yearStart},${g.yearEnd}] em ${row.id}`);
        }
      }
    }

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n[property] ${rows.length} listings em ${secs}s, ${checked} com match`);
    const dist = [...perSource.entries()]
      .sort((a, b) => b[1].exato + b[1].designacao + b[1].provavel + b[1].null - (a[1].exato + a[1].designacao + a[1].provavel + a[1].null))
      .map(([s, b]) => `  ${s.padEnd(22)} exato=${b.exato} desig=${b.designacao} prov=${b.provavel} null=${b.null}`);
    console.log("distribuição por fonte:\n" + dist.join("\n"));
    assert.ok(Number(secs) < 60, `resolver demasiado lento: ${secs}s`);

    await close();
  },
);
