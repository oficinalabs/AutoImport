/**
 * Normalizador determinístico — variações multi-língua reais dos coletores
 * (DE/FR/NL/ES/PT). Os casos vêm dos dados em tools/collector/out e do
 * research por site.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kmBand,
  normFuel,
  normMake,
  normModel,
  normalizeVehicle,
} from "../../lib/engine/normalize-vehicle";

test("normMake: aliases e acentos", () => {
  assert.equal(normMake("VW"), "volkswagen");
  assert.equal(normMake("Volkswagen"), "volkswagen");
  assert.equal(normMake("Mercedes-Benz"), "mercedes");
  assert.equal(normMake("Citroën"), "citroen");
  assert.equal(normMake("ŠKODA"), "skoda");
  assert.equal(normMake("TOYOTA"), "toyota");
  assert.equal(normMake("BMW Motorrad"), "bmw-motorrad"); // motos ≠ bmw
  assert.equal(normMake(null), null);
});

test("normModel BMW: Serie 3 · Série 3 · 3er · 3-serie · 3 Series · 320d → serie-3", () => {
  for (const raw of ["Serie 3", "Série 3", "3er", "3-serie", "3 Series", "320d", "320", "3er Reihe"]) {
    assert.equal(normModel("bmw", raw), "serie-3", raw);
  }
  assert.equal(normModel("bmw", "X1"), "x1");
  assert.equal(normModel("bmw", "iX1"), "ix1");
  assert.equal(normModel("bmw", "i4"), "i4");
  assert.equal(normModel("bmw", "Serie 2 Active Tourer"), "serie-2");
});

test("normModel Mercedes: Classe A · A-Klasse · A 180 · A Class → classe-a; Classe CLA → cla", () => {
  for (const raw of ["Classe A", "A-Klasse", "A 180", "A Class", "A"]) {
    assert.equal(normModel("mercedes", raw), "classe-a", raw);
  }
  assert.equal(normModel("mercedes", "Classe CLA"), "cla");
  assert.equal(normModel("mercedes", "CLA"), "cla");
  assert.equal(normModel("mercedes", "GLC"), "glc");
  assert.equal(normModel("mercedes", "C 220 d"), "classe-c");
});

test("normModel Peugeot/VW/Renault: sufixos de carroçaria caem", () => {
  assert.equal(normModel("peugeot", "308 SW"), "308");
  assert.equal(normModel("peugeot", "2008"), "2008");
  assert.equal(normModel("volkswagen", "Golf Variant"), "golf");
  assert.equal(normModel("volkswagen", "T-Roc"), "t-roc");
  assert.equal(normModel("volkswagen", "ID.4"), "id-4");
  assert.equal(normModel("renault", "Mégane"), "megane");
  assert.equal(normModel("toyota", "RAV4"), "rav-4");
  assert.equal(normModel("toyota", "RAV 4"), "rav-4");
});

test("normModel fallback: primeiro token quando não há regra", () => {
  assert.equal(normModel("wiesmann", "MF 5 Roadster"), "mf");
  assert.equal(normModel(null, "Enyaq iV 80"), "enyaq");
});

test("normModel: a variante desmascara o submodelo (auditoria)", () => {
  // Santogal: model="Mini", submodelo na variante → Countryman ≠ Cooper
  assert.equal(normModel("mini", "Mini", "Mini Countryman E Essential XS"), "countryman");
  assert.equal(normModel("mini", "Mini", "Mini Cooper E Classic S"), "mini-cooper");
  assert.equal(normModel("mini", "Cooper", "SE"), "mini-cooper");
  // Sportsvan (monovolume) nunca compara com Golf hatch
  assert.equal(normModel("volkswagen", "Golf VII Sportsvan", "1.5 TSI ACT Highline"), "golf-sportsvan");
  assert.equal(normModel("volkswagen", "Golf", "1.5 TSI"), "golf");
});

test("normModel BYD: Dolphin Surf é modelo próprio, nunca compara com Dolphin", () => {
  // "Surf" no próprio modelo
  assert.equal(normModel("byd", "Dolphin Surf"), "dolphin-surf");
  assert.equal(normModel("byd", "Dolphin Surf", "43,2 kWh Comfort"), "dolphin-surf");
  // "Surf" escondido na variante (model genérico "Dolphin")
  assert.equal(normModel("byd", "Dolphin", "Surf Comfort 43,2kWh"), "dolphin-surf");
  assert.equal(normModel("byd", "Dolphin", "Active Surf"), "dolphin-surf");
  // Dolphin normal continua dolphin
  assert.equal(normModel("byd", "Dolphin"), "dolphin");
  assert.equal(normModel("byd", "Dolphin", "Comfort 60,4 kWh"), "dolphin");
  // "surfer" não é "surf"; Seal não é afetado
  assert.equal(normModel("byd", "Dolphin", "Surfer Edition"), "dolphin");
  assert.equal(normModel("byd", "Seal", "U DM-i"), "seal");
});

test("normFuel multi-língua", () => {
  // diesel
  for (const raw of ["Diesel", "Gasóleo", "Gazole", "Gasoil", "gasoleo"]) {
    assert.equal(normFuel(raw), "diesel", raw);
  }
  // gasolina
  for (const raw of ["Gasolina", "Benzin", "Essence", "Petrol", "Benzine"]) {
    assert.equal(normFuel(raw), "gasolina", raw);
  }
  // elétrico
  for (const raw of ["Elétrico", "Electrico", "Electric", "Elektro", "Électrique"]) {
    assert.equal(normFuel(raw), "elétrico", raw);
  }
  // híbrido (incl. o formato AS24 "Elektro/Benzin" e o caetano "Hibrido (Diesel)")
  for (const raw of ["Híbrido", "Hybrid", "Hybride", "Elektro/Benzin", "Hibrido (Diesel)"]) {
    assert.equal(normFuel(raw), "híbrido", raw);
  }
  // phev
  for (const raw of ["Plug-in Hybrid", "Híbrido Plug-In", "PHEV"]) {
    assert.equal(normFuel(raw), "phev", raw);
  }
  // phev escondido na variante (caso real Caetano: fuel="Hibrido",
  // variant="Allure Plug-in Hybrid 195cv" — sem isto compara HEV com PHEV)
  assert.equal(normFuel("Hibrido", "Allure Plug-in Hybrid 195cv e-DCS7"), "phev");
  assert.equal(normFuel("Elektro/Benzin", "GT PlugIn Hybrid"), "phev");
  assert.equal(normFuel("Hibrido", "1.2i Hybrid 145 e-DCS6 Allure"), "híbrido");
  assert.equal(normFuel("Diesel", "Plug-in Edition"), "diesel"); // variante só desambigua híbridos
  // sufixos PHEV de marca (auditoria: Mercedes E 300 e/de, BMW 330e/225xe, VW GTE)
  assert.equal(normFuel("Hibrido", "300 e Station Auto"), "phev");
  assert.equal(normFuel("Hibrido (Diesel)", "300 de Limo tec hibrida EQ"), "phev");
  assert.equal(normFuel("Elektro/Benzin", "330e Touring"), "phev");
  assert.equal(normFuel("Elektro/Benzin", "225xe Active Tourer"), "phev");
  assert.equal(normFuel("Hibrido", "Golf GTE"), "phev");
  // …mas "Hybrid 145 e-DCS6" (caixa Peugeot) NÃO é sufixo PHEV
  assert.equal(normFuel("Hibrido", "Hybrid 145 e-DCS6"), "híbrido");
  // CO₂ desambigua o "Elektro/Benzin" do AS24 (PHEV ≤ 60 g; HEV ~90–130 g)
  assert.equal(normFuel("Elektro/Benzin", "E 300 e AVANTGARDE", 12), "phev");
  assert.equal(normFuel("Elektro/Benzin", "Yaris Comfort", 92), "híbrido");
  // HEV escondido na variante com fuel=Gasolina (caso real: Tucson HEV Caetano)
  assert.equal(normFuel("Gasolina", "HEV 1.6 TGDI AT Vanguard MY25"), "híbrido");
  // mild-hybrid 48V continua gasolina
  assert.equal(normFuel("Gasolina", "1.6 TGDi 48V Vanguard DCT"), "gasolina");
  assert.equal(normFuel("Gasolina", "Mild Hybrid 130cv"), "gasolina");
  // fora de âmbito / ambíguo → null
  for (const raw of ["GPL", "LPG", "Gas", "CNG", "Hidrogénio"]) {
    assert.equal(normFuel(raw), null, raw);
  }
});

test("normalizeVehicle: chave completa ou null", () => {
  const v = normalizeVehicle("BMW", "320d", "Diesel");
  assert.deepEqual(v, { make: "bmw", model: "serie-3", fuel: "diesel", normKey: "bmw|serie-3|diesel" });
  assert.equal(normalizeVehicle("BMW", "320d", "GPL"), null);
  assert.equal(normalizeVehicle(null, "320d", "Diesel"), null);
  // a variante separa PHEV de HEV na chave
  assert.equal(
    normalizeVehicle("Peugeot", "3008", "Hibrido", "Allure Plug-in Hybrid 195cv")?.normKey,
    "peugeot|3008|phev",
  );
  assert.equal(
    normalizeVehicle("Peugeot", "3008", "Hibrido", "1.2i Hybrid 145")?.normKey,
    "peugeot|3008|híbrido",
  );
});

test("kmBand: 25.000 km por banda", () => {
  assert.equal(kmBand(0), 0);
  assert.equal(kmBand(24999), 0);
  assert.equal(kmBand(25000), 1);
  assert.equal(kmBand(87000), 3);
});
