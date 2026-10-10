/**
 * Ilhas espanholas fora do motor de custos. Os casos vêm dos valores REAIS de
 * `listings.region` no warehouse (ver lib/cost-engine/territory.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isExcludedTerritory } from "../../lib/cost-engine/territory";

// ── Regiões, tal como os coletores as gravam ────────────────────

test("Las Palmas → excluído", () => {
  assert.equal(isExcludedTerritory("ES", "Las Palmas", null), true);
});

test("regiões insulares em todas as formas vistas na base → excluídas", () => {
  for (const region of [
    "Islas Baleares",
    "Tenerife",
    "Santa Cruz de Tenerife",
    "Provincia de Las Palmas",
    "Provincia de Illes Balears",
    "07800, Eivissa, Provincia de Illes Balears",
    "38108, Taganana, Santa Cruz de Tenerife, Provincia de Santa Cruz de Tenerife",
    "Puerto del Rosario, Provincia de Las Palmas",
  ]) {
    assert.equal(isExcludedTerritory("ES", region, null), true, region);
  }
});

test("Madrid → incluído", () => {
  assert.equal(isExcludedTerritory("ES", "Madrid", null), false);
});

test("'palma' continental não é ilha (Palma del Río, Palma de Gandía)", () => {
  assert.equal(isExcludedTerritory("ES", "Palma del Río, Provincia de Córdoba", "14700"), false);
  assert.equal(isExcludedTerritory("ES", "Palma de Gandía, Provincia de Valencia", null), false);
});

// ── Código postal (mais fiável que o texto, quando existe) ───────

test("CP 35001/38001/07001 → excluídos", () => {
  for (const cp of ["35001", "38001", "07001"]) {
    assert.equal(isExcludedTerritory("ES", null, cp), true, cp);
  }
});

test("CP 28001 (Madrid) → incluído", () => {
  assert.equal(isExcludedTerritory("ES", null, "28001"), false);
});

test("CP manda sobre uma região omissa: 38108 sem região → excluído", () => {
  assert.equal(isExcludedTerritory("ES", null, "38108"), true);
});

// ── Fecha aberto e não sai de Espanha ───────────────────────────

test("sem região e sem CP → incluído (não excluir por falta de dados)", () => {
  assert.equal(isExcludedTerritory("ES", null, null), false);
  assert.equal(isExcludedTerritory("ES", undefined, undefined), false);
});

test("PLZ alemão 07xxx (Turíngia) não é Baleares", () => {
  assert.equal(isExcludedTerritory("DE", "Thüringen", "07743"), false);
});

test("país nulo ou não-ES → nunca excluído", () => {
  assert.equal(isExcludedTerritory(null, "Las Palmas", "35001"), false);
  assert.equal(isExcludedTerritory("FR", null, "07001"), false);
});

// ── Fora do território IVA da UE e Córsega (P02) ─────────────────

test("Ceuta (51) e Melilla (52) → excluídos, por CP e por região", () => {
  assert.equal(isExcludedTerritory("ES", null, "51001"), true);
  assert.equal(isExcludedTerritory("ES", null, "52001"), true);
  assert.equal(isExcludedTerritory("ES", "Ceuta", null), true);
  assert.equal(isExcludedTerritory("ES", "Melilla", null), true);
});

test("DOM franceses (971–976) → excluídos", () => {
  for (const cp of ["97110", "97200", "97300", "97400", "97600"]) {
    assert.equal(isExcludedTerritory("FR", null, cp), true, cp);
  }
  assert.equal(isExcludedTerritory("FR", "Guadeloupe", null), true);
  assert.equal(isExcludedTerritory("FR", "La Réunion", null), true);
});

test("Córsega (20xxx, 2A/2B) → excluída", () => {
  assert.equal(isExcludedTerritory("FR", null, "20000"), true);
  assert.equal(isExcludedTerritory("FR", null, "20200"), true);
  assert.equal(isExcludedTerritory("FR", null, "2A"), true);
  assert.equal(isExcludedTerritory("FR", "Haute-Corse", null), true);
});

test("França continental → incluída", () => {
  assert.equal(isExcludedTerritory("FR", "Île-de-France", "75008"), false);
  assert.equal(isExcludedTerritory("FR", null, "13001"), false);
  assert.equal(isExcludedTerritory("FR", null, null), false);
});

test("CP 51/52 fora de Espanha não é Ceuta/Melilla", () => {
  assert.equal(isExcludedTerritory("DE", null, "52062"), false); // Aachen
  assert.equal(isExcludedTerritory("FR", null, "51100"), false); // Reims
});
