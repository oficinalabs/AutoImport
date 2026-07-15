/**
 * Parser do catálogo ultimatespecs.com contra páginas reais (fixtures de jul/2026):
 * página de modelo (Kia Stonic 2021) → linhas de versão com nome/ano/potência/cc;
 * página de versão (1.0 T-GDI 100) → ficha normalizada + specs cruas.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  parseModelPage,
  parseModelUrl,
  parseSitemapLocs,
  parseVersionPage,
} from "../../tools/collector/ultimatespecs/parse";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", "ultimatespecs", name), "utf8");

test("parseSitemapLocs extrai <loc> de índice e folha", () => {
  const xml = `<?xml version="1.0"?><sitemapindex><sitemap>
    <loc>https://www.ultimatespecs.com/sitemapversions_5000.xml</loc></sitemap>
    <sitemap><loc>https://www.ultimatespecs.com/sitemapversions_10000.xml</loc></sitemap></sitemapindex>`;
  assert.deepEqual(parseSitemapLocs(xml), [
    "https://www.ultimatespecs.com/sitemapversions_5000.xml",
    "https://www.ultimatespecs.com/sitemapversions_10000.xml",
  ]);
});

test("parseModelUrl separa marca, id, modelo e ano", () => {
  const ref = parseModelUrl("https://www.ultimatespecs.com/car-specs/Kia/M27110/Stonic-2021");
  assert.ok(ref);
  assert.equal(ref.make, "Kia");
  assert.equal(ref.mid, "M27110");
  assert.equal(ref.model, "Stonic");
  assert.equal(ref.modelYear, 2021);

  const gen = parseModelUrl(
    "https://www.ultimatespecs.com/car-specs/Audi/M27111/Q7-3rd-Generation",
  );
  assert.ok(gen);
  assert.equal(gen.model, "Q7 3rd Generation");
  assert.equal(gen.modelYear, null);

  const marca = parseModelUrl("https://www.ultimatespecs.com/car-specs/Alfa-Romeo/M1/33");
  assert.ok(marca);
  assert.equal(marca.make, "Alfa Romeo");
  assert.equal(marca.model, "33");

  assert.equal(parseModelUrl("https://www.ultimatespecs.com/car-specs/Kia/121009/X.html"), null);
});

test("parseModelPage extrai as versões com ano, potência e cilindrada", () => {
  const ref = parseModelUrl("https://www.ultimatespecs.com/car-specs/Kia/M27110/Stonic-2021");
  assert.ok(ref);
  const versions = parseModelPage(
    fixture("model-kia-stonic-2021.html"),
    ref,
    "2026-07-15T00:00:00Z",
  );

  assert.ok(versions.length >= 10, `esperava ≥10 versões, obtive ${versions.length}`);
  const v = versions.find((x) => x.versionId === "141870");
  assert.ok(v, "versão 141870 (1.0 T-GDI 100) presente");
  assert.equal(v.name, "Stonic 2021 1.0 T-GDI 100");
  assert.equal(v.mid, "M27110");
  assert.equal(v.make, "Kia");
  assert.equal(v.model, "Stonic");
  assert.equal(v.modelSlug, "Stonic-2021");
  assert.equal(v.fuelSection, "petrol");
  assert.equal(v.year, 2024);
  assert.equal(v.powerHp, 100);
  assert.equal(v.powerKw, 74);
  assert.equal(v.displacementCc, 998);
  assert.equal(
    v.url,
    "https://www.ultimatespecs.com/car-specs/Kia/141870/Kia-Stonic-2021-10-T-GDI-100.html",
  );

  // galeria do modelo: só imagens deste modelo (path /27110/), https absoluto
  assert.ok(v.modelImages.length >= 3, `esperava ≥3 imagens, obtive ${v.modelImages.length}`);
  for (const u of v.modelImages) {
    assert.match(u, /^https:\/\/www\.ultimatespecs\.com\/cargallery\/\d+\/27110\//);
  }

  // sem duplicados por versionId e todas com nome e URL .html
  const ids = new Set(versions.map((x) => x.versionId));
  assert.equal(ids.size, versions.length);
  for (const x of versions) {
    assert.ok(x.name.length > 0);
    assert.ok(x.url.endsWith(".html"));
  }
});

test("parseVersionPage normaliza a ficha técnica", () => {
  const deep = parseVersionPage(fixture("version-kia-stonic-10-tgdi-100.html"));
  assert.equal(deep.generation, "Stonic - 2021 Facelift");
  assert.equal(deep.body, "SUV");
  assert.equal(deep.doors, 5);
  assert.equal(deep.seats, 5);
  assert.equal(deep.fuel, "Petrol");
  assert.equal(deep.engineCode, "G3LE");
  assert.equal(deep.cylinders, "Inline 3");
  assert.equal(deep.torqueNm, 172);
  assert.equal(deep.drivetrain, "FWD");
  assert.equal(deep.gearbox, "6 speed Manual");
  assert.equal(deep.co2Wltp, 125);
  assert.equal(deep.emissionStandard, "Euro 6e");
  assert.equal(deep.curbWeightKg, 1195);
  assert.match(String(deep.imageUrl), /^https:\/\/www\.ultimatespecs\.com\/cargallery\/.*w800_/);
  // specs cruas preservadas (cilindrada com unidade original)
  assert.match(deep.specs["Engine displacement"], /^998 cm/);
  assert.match(deep.specs.Horsepower, /100 PS \/ 99 HP \/ 74 kW/);
  // "-" (sem dado no site) não entra nas specs
  assert.equal(deep.specs["Aerodynamic drag coefficient - Cx"], undefined);
});
