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

// ── P06: palavras novas por país (estudos de out. 2026, secção 6) ──

test("P06 — DE: preço de exportação/profissional, Brief na banca, preço com financiamento", () => {
  for (const v of [
    "Golf 1.6 TDI Exportpreis",
    "A4 Avant Händlerpreis!",
    "Passat Variant kein Privatverkauf",
    "Focus Turnier *Brief bei Bank*",
    "Polo 1.0 ohne Brief",
    "Tiguan Preis gilt nur bei Finanzierung",
    "Octavia Finanzierungspreis",
    "Leon ST Aktionspreis mit Finanzierung",
    "Corsa F Preis bei Inzahlungnahme",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

test("P06 — FR/BE: marchand, sans CT, moteur HS, VGE, export", () => {
  for (const v of [
    "Clio IV prix marchand",
    "308 SW VO marchand",
    "C3 vente aux pros uniquement",
    "Megane réservé aux professionnels",
    "208 sans CT",
    "Twingo sans contrôle technique",
    "Scenic moteur HS",
    "Kangoo boite HS",
    "Picasso pour pièces",
    "Zoe non roulant",
    "Captur ne démarre pas",
    "DS3 VGE",
    "Kadjar prix export",
    "Golf uniquement export",
    "Astra sans garantie",
    "Focus zonder keuring",
    "Fiesta prijs met inruil",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

test("P06 — NL e ES: venda a profissionais, avaria, sem inspeção", () => {
  for (const v of [
    "Polo alleen voor handel",
    "Astra handel/export",
    "Golf meeneemprijs",
    "Clio verkocht zoals gezien",
    "A3 Motorschade",
    "Corsa loopt niet",
    "Aygo geen APK",
    "Fiesta NAP onlogisch",
    "León FR solo profesionales",
    "Ibiza para exportar",
    "Megane motor averiado",
    "Corsa no arranca",
    "Clio sin ITV",
  ]) {
    assert.equal(isNotRetailListing(v), true, v);
  }
});

test("P06 — o que parece mas não é: financiamento possível, VE elétrico, sem avarias", () => {
  for (const v of [
    "Golf 1.5 TSI Finanzierung möglich",
    "Passat Inzahlungnahme möglich",
    "Gewerbeleasing ab 299 €",
    "Zoe VE 100% électrique",
    "Megane E-Tech garantie 12 mois",
    "León FR sin averías, sin siniestros",
    "Polo NAP logisch",
    "Golf Variant Export möglich",
  ]) {
    assert.equal(isNotRetailListing(v), false, v);
  }
});
