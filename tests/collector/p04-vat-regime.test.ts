/**
 * P04: vocabulário de IVA dos anúncios DE/NL/BE (tools/collector/lib/vat-regime-text.ts).
 *
 * O que pode partir em silêncio: um anúncio em margem marcado 'dedutivel' faz o motor
 * descontar um IVA que o stand nunca recupera (lucro inflacionado). Por isso: sem menção →
 * null, margem ganha a dedutível, particular ganha a tudo.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  netPriceFromText,
  priceLabelIsNet,
  resolveVat,
  vatFromRaw,
  vatRegimeFromText,
} from "../../tools/collector/lib/vat-regime-text";

test("DE: MwSt. ausweisbar → dedutível; §25a / nicht ausweisbar → margem", () => {
  assert.equal(vatRegimeFromText("¹ MwSt. ausweisbar"), "dedutivel");
  assert.equal(vatRegimeFromText("Preis inkl. 19% MwSt."), "dedutivel");
  assert.equal(vatRegimeFromText("Preis zzgl. MwSt."), "dedutivel");
  assert.equal(vatRegimeFromText("differenzbesteuert nach §25a UStG"), "margem");
  assert.equal(vatRegimeFromText("MwSt. nicht ausweisbar"), "margem");
  assert.equal(vatRegimeFromText("inkl. MwSt."), null, "sem a taxa não chega");
});

test("NL: BTW verrekenbaar / BTW-auto / excl. BTW → dedutível; marge → margem", () => {
  assert.equal(vatRegimeFromText("BTW verrekenbaar"), "dedutivel");
  assert.equal(vatRegimeFromText("BTW-auto, NAP logisch"), "dedutivel");
  assert.equal(vatRegimeFromText("prijs excl. BTW"), "dedutivel");
  assert.equal(vatRegimeFromText("BTW niet verrekenbaar"), "margem");
  assert.equal(vatRegimeFromText("Marge-auto"), "margem");
  assert.equal(vatRegimeFromText("margeregeling"), "margem");
});

test("BE: TVA déductible / HTVA / BTW aftrekbaar → dedutível; régime de la marge → margem", () => {
  assert.equal(vatRegimeFromText("TVA déductible"), "dedutivel");
  assert.equal(vatRegimeFromText("TVA recuperable"), "dedutivel");
  assert.equal(vatRegimeFromText("Prix HTVA"), "dedutivel");
  assert.equal(vatRegimeFromText("BTW aftrekbaar"), "dedutivel");
  assert.equal(vatRegimeFromText("Régime de la marge"), "margem");
  assert.equal(vatRegimeFromText("TVA non récupérable"), "margem");
});

test("sem menção → null; margem e dedutível juntos → margem", () => {
  assert.equal(vatRegimeFromText("Scheckheftgepflegt, TÜV neu"), null);
  assert.equal(vatRegimeFromText(null, undefined, ""), null);
  assert.equal(vatRegimeFromText("MwSt. ausweisbar", "§25a"), "margem");
  // "Netto" fora do rótulo do preço não decide nada (aparece em textos de financiamento).
  assert.equal(vatRegimeFromText("Netto-Darlehensbetrag 15.000 €"), null);
});

test("rótulo do preço líquido e preço líquido escrito", () => {
  assert.equal(priceLabelIsNet("16.807 € zzgl. 19% MwSt."), true);
  assert.equal(priceLabelIsNet("€ 20.000,- excl. BTW"), true);
  assert.equal(priceLabelIsNet("9 900 € sem IVA"), true);
  assert.equal(priceLabelIsNet("€ 23.800,-"), false);
  assert.equal(netPriceFromText("Händlerfahrzeug, Netto: 21.000 €"), 21000);
  assert.equal(netPriceFromText("Prix HTVA : 16 807 €"), 16807);
  assert.equal(netPriceFromText("€ 16.807,- excl. BTW"), 16807);
  assert.equal(netPriceFromText("Netto-Darlehensbetrag 15.000 €"), null);
});

test("payload: flag booleana e preço líquido; false e isVatLabelLegallyRequired não decidem", () => {
  assert.deepEqual(vatFromRaw({ price: { taxDeductible: true, netPriceRaw: 20000 } }), {
    regime: "dedutivel",
    netPrice: 20000,
  });
  assert.deepEqual(vatFromRaw({ isVatDeductible: false }), { regime: null, netPrice: null });
  assert.deepEqual(vatFromRaw({ price: { isVatLabelLegallyRequired: true } }), {
    regime: null,
    netPrice: null,
  });
  assert.equal(vatFromRaw({ vatType: "VAT_DEDUCTIBLE" }).regime, "dedutivel");
  assert.equal(vatFromRaw({ vatType: "MARGIN" }).regime, "margem");
  assert.equal(vatFromRaw({ taxation: "DIFFERENZBESTEUERT" }).regime, "margem");
  assert.equal(vatFromRaw({ taxonomy: { label: "deductible" } }).regime, null);
});

test("resolveVat: particular > margem > dedutível > null; o líquido só fica no dedutível", () => {
  assert.deepEqual(resolveVat({ texts: ["MwSt. ausweisbar"], isPrivate: true, price: 10000 }), {
    vat_regime: "particular",
    price_net: null,
  });
  assert.deepEqual(resolveVat({ raw: { netPrice: 8000 }, texts: ["§25a"], price: 10000 }), {
    vat_regime: "margem",
    price_net: null,
  });
  assert.deepEqual(resolveVat({ priceLabel: "€ 20.000,- excl. BTW", price: 20000 }), {
    vat_regime: "dedutivel",
    price_net: 20000,
  });
  assert.deepEqual(
    resolveVat({ raw: { netPrice: 25000 }, price: 20000 }),
    { vat_regime: null, price_net: null },
    "líquido acima do bruto é lixo e não serve de sinal",
  );
  assert.deepEqual(resolveVat({ texts: ["Unfallfrei"], price: 15000 }), {
    vat_regime: null,
    price_net: null,
  });
});
