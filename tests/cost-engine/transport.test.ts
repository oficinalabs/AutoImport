/** Transporte por país e região (lib/cost-engine/transport.ts; estudos §2/§5). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSPORT_COST_EUR, estimateTransport } from "../../lib/cost-engine/transport";

test("sem código postal → valor base do país", () => {
  assert.deepEqual(TRANSPORT_COST_EUR, { DE: 950, NL: 1000, BE: 950, FR: 800, ES: 550 });
  for (const country of ["DE", "NL", "BE", "FR", "ES"] as const) {
    assert.equal(estimateTransport(country), TRANSPORT_COST_EUR[country], country);
    assert.equal(estimateTransport(country, null), TRANSPORT_COST_EUR[country], country);
  }
});

test("DE: sul/oeste 950 €, norte/leste (PLZ 0/1/2) 1 200 €", () => {
  assert.equal(estimateTransport("DE", "80331"), 950); // Munique
  assert.equal(estimateTransport("DE", "50667"), 950); // Colónia
  assert.equal(estimateTransport("DE", "10115"), 1200); // Berlim
  assert.equal(estimateTransport("DE", "20095"), 1200); // Hamburgo
  assert.equal(estimateTransport("DE", "01067"), 1200); // Dresden
});

test("DE: suplemento de seguro acima de 35/50/75 mil €", () => {
  assert.equal(estimateTransport("DE", "80331", 35000), 950);
  assert.equal(estimateTransport("DE", "80331", 35001), 1012);
  assert.equal(estimateTransport("DE", "80331", 60000), 1073);
  assert.equal(estimateTransport("DE", "10115", 90000), 1385);
});

test("FR por département: Paris 700, Lyon 775, Lille 900, Nice 1 050, resto 800", () => {
  assert.equal(estimateTransport("FR", "75008"), 700);
  assert.equal(estimateTransport("FR", "33000"), 700);
  assert.equal(estimateTransport("FR", "69001"), 775);
  assert.equal(estimateTransport("FR", "59000"), 900);
  assert.equal(estimateTransport("FR", "06000"), 1050);
  assert.equal(estimateTransport("FR", "45000"), 800); // Orléans, sem dados
});

test("ES por província: Madrid 550, Vigo 650, Bilbao 700, Barcelona 750", () => {
  assert.equal(estimateTransport("ES", "28001"), 550);
  assert.equal(estimateTransport("ES", "36201"), 650);
  assert.equal(estimateTransport("ES", "48001"), 700);
  assert.equal(estimateTransport("ES", "08001"), 750);
  assert.equal(estimateTransport("ES", "41001"), 600); // Sevilha
});

test("BE e NL: valor fixo, o código postal não muda nada", () => {
  assert.equal(estimateTransport("BE", "2000"), 950);
  assert.equal(estimateTransport("NL", "1012 AB"), 1000);
});
