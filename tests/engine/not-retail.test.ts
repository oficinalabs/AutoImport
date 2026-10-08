/**
 * Anúncios cujo preço não é de retalho. Os casos vêm dos valores REAIS de
 * `listings.variant` no warehouse (ver lib/engine/not-retail.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isNotRetailListing } from "../../lib/engine/not-retail";

// ── Avaria declarada ────────────────────────────────────────────

test("avaria mecânica no texto → excluído", () => {
  for (const v of [
    "116 i Sport Motorstörung läuft auf 3 Zylinder",
    "Astra K Sports Tourer/Start/Stop/Motorschaden",
    "Astra ST 1.5 D Business Ed. -Motorschaden-",
    "XF Prestige*MOTORSCHADEN",
    "Focus Turnier 1.5 EB ST-Line X -Getriebeschaden-",
    "116 i Sport Motorstoerung", // dígrafo alemão (medido no corpus: "haendler")
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

test("para peças / não circula → excluído", () => {
  for (const v of [
    "Renault Twingo 1.2 Benzin,TÜV,Zahnreimen Gerissen Bastler",
    "Subaru Forester 2.0X Turbo *Teileträger*",
    "2 Mercedes SLK PAKET Schlachtfest",
    "Caddy zum Ausschlachten oder Bastler",
    "Ford Focus 1.6 Benzin | BJ 2005 | NICHT fahrbereit",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

test("sem inspeção → excluído", () => {
  for (const v of [
    "Aygo AYGO Basis *KEIN TÜV*",
    "Cooper *1.HAND*PANORAMA*KLIMA*SHZ*OHNE TÜV/AU*",
    "Peugeot 206 ohne Tüv",
    "Citroen Jumper 30 L2H2 HDi 100 Festpreis kein Tüv",
    "C3 Picasso Selection *EXPORT / KEIN TÜV*",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

// ── Venda só a profissionais / exportação ───────────────────────

test("venda só a profissionais ou a exportação → excluído", () => {
  for (const v of [
    "up! 1.0 move +nur an Händler/Export+",
    "Tipo Cross 1.0/ **Verkauf nur an Gewerbe!**",
    "Matrix 1.6 GLS Händler / Export",
    "Clio V Business Edition NUR AN HÄNDLER Klima",
    "Sorento GT-Line 4WD/**Verkauf nur an Gewerbe!**",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

// ── As armadilhas: negações que significam o CONTRÁRIO ──────────

test("'unfallfrei' (SEM acidentes) NÃO é excluído", () => {
  for (const v of [
    "Urus - Grigio Lynx - B&O - 1.Hand - Unfallfrei",
    "320d xDrive Touring unfallfrei Scheckheft",
    "Golf VII 1.5 TSI unfallfreies Fahrzeug",
  ]) {
    assert.equal(isNotRetailListing(v), false, v);
  }
});

test("'unbeschädigt' (NÃO danificado) NÃO é excluído", () => {
  assert.equal(isNotRetailListing("T-Roc 1.5 TSI unbeschädigt 1.Hand"), false);
});

test("'Unfall' afirmativo continua a ser excluído", () => {
  for (const v of [
    "Aygo AYGO Cool Unfall",
    "Formentor 1.5 eTSI 110 kW *UNFALL*",
    "A4 Avant 2.0 TDI Unfallschaden",
    "Passat Variant beschädigt",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

// ── Anúncios normais e fecho aberto ─────────────────────────────

test("anúncios normais não são excluídos", () => {
  for (const v of [
    "T900d (compensa)",
    "992 GTS Approved bis 05/2027",
    "Urus S | Akrapovic | Full PPF | Panoramic Roof",
    "i30 cw Trend*KLIMA*PDC*KAMERA*TEMPOMAT*NAVI",
    "PEUGEOT 3008 SUV 3008 1.5BlueHDi Active Pack S&S",
    // "Export" sozinho não prova nada: um stand pode só dizer que exporta.
    "Grand C4 Picasso 2.0 Diesel, Für Export, Klima",
  ]) {
    assert.equal(isNotRetailListing(v), false, v);
  }
});

test("sem variant → não excluído (não excluir por falta de dados)", () => {
  assert.equal(isNotRetailListing(null), false);
  assert.equal(isNotRetailListing(undefined), false);
  assert.equal(isNotRetailListing(""), false);
});
