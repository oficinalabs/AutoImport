/**
 * Conteúdo por país da ficha do anúncio (lib/country-guides.ts): a nota de IVA,
 * onde confirmar os km e a mensagem ao vendedor. Funções puras.
 *
 * O que aqui se prova: (1) anúncios antigos, com os campos novos a null, dão a
 * nota segura ("contámos como margem"); (2) os defaults do plano §5 (NL
 * "dedutível" sem líquido → margem); (3) os avisos de km por país e idade;
 * (4) todos os países têm checklist e mensagem, sem marcadores por preencher.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { COUNTRY_GUIDES, fillSellerMessage, kmAdvice, vatNote } from "../../lib/country-guides";
import type { CountryCode } from "../../lib/types";

const COUNTRIES: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
const NOW = new Date("2026-10-10T12:00:00Z");

test("anúncio sem menção de IVA e estimativa antiga: contámos como margem", () => {
  const n = vatNote(undefined, {}, "DE");
  assert.equal(n.said, "Não diz");
  assert.equal(n.applied, "Regime da margem");
  assert.equal(n.explanation, "O anúncio não diz; contámos como margem. Confirma com o vendedor.");
});

test("dedutível aplicado: compra pelo líquido, revenda com 23 % sobre o total", () => {
  const n = vatNote("dedutivel", { vatRegime: "dedutivel" }, "DE");
  assert.equal(n.applied, "IVA dedutível");
  assert.match(n.explanation, /19 %/);
  assert.match(n.explanation, /23 % de IVA sobre o preço total/);
});

test("NL dedutível sem preço líquido fica em margem e explica a BPM", () => {
  const n = vatNote("dedutivel", { vatRegime: "margem" }, "NL");
  assert.equal(n.said, "IVA dedutível");
  assert.equal(n.applied, "Regime da margem");
  assert.match(n.explanation, /BPM/);
});

test("margem e particular: IVA só sobre a margem", () => {
  for (const src of ["margem", "particular"] as const) {
    const n = vatNote(src, { vatRegime: "margem" }, "FR");
    assert.match(n.explanation, /× 23\/123/);
  }
});

test("km: Car-Pass na Bélgica, HistoVec em França só a partir dos 4 anos", () => {
  assert.match(kmAdvice("BE", 2020, undefined, NOW)[0].text, /Car-Pass/);
  assert.match(kmAdvice("FR", 2020, undefined, NOW)[0].text, /HistoVec/);
  const novo = kmAdvice("FR", 2024, undefined, NOW)[0];
  assert.equal(novo.tone, "warn");
  assert.match(novo.text, /não há leituras oficiais/);
  assert.match(kmAdvice("ES", 2024, undefined, NOW)[0].text, /ITV/);
  assert.match(kmAdvice("ES", 2019, undefined, NOW)[0].text, /informe completo da DGT/);
  assert.match(kmAdvice("DE", 2019, undefined, NOW)[0].text, /relatórios HU/);
});

test("km: veredito da RDW substitui o conselho genérico dos Países Baixos", () => {
  const semCheck = kmAdvice("NL", 2019, undefined, NOW);
  assert.equal(semCheck.length, 1);
  assert.match(semCheck[0].text, /veredito de km da RDW/);

  const mau = kmAdvice(
    "NL",
    2019,
    { source: "RDW", verdict: "incoerente", checkedAt: "2026-10-01T00:00:00Z" },
    NOW,
  );
  assert.equal(mau.length, 1);
  assert.equal(mau[0].tone, "bad");

  const bom = kmAdvice(
    "NL",
    2019,
    { source: "RDW", verdict: "coerente", checkedAt: "2026-10-01T00:00:00Z" },
    NOW,
  );
  assert.equal(bom[0].tone, "good");
});

test("todos os países têm checklist, avisos e mensagem; BE em francês e neerlandês", () => {
  for (const c of COUNTRIES) {
    const g = COUNTRY_GUIDES[c];
    assert.ok(g.checklist.length >= 5, c);
    assert.ok(g.warnings.length > 0, c);
    assert.ok(g.messages.length > 0, c);
  }
  assert.deepEqual(
    COUNTRY_GUIDES.BE.messages.map((m) => m.lang),
    ["fr", "nl"],
  );
});

test("a mensagem preenchida não deixa marcadores por trocar", () => {
  for (const c of COUNTRIES) {
    for (const m of COUNTRY_GUIDES[c].messages) {
      const t = fillSellerMessage(m.template, {
        car: "BMW 320d",
        price: "23 800 €",
        link: "https://exemplo.test/1",
      });
      assert.doesNotMatch(t, /\{carro\}|\{preco\}|\{link\}/, `${c}/${m.lang}`);
      assert.match(t, /BMW 320d/);
      assert.match(t, /23 800 €/);
    }
  }
  const semLink = fillSellerMessage("{link}", { car: "x", price: "y" });
  assert.equal(semLink, "[link do anúncio]");
});
