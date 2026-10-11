/**
 * Mapeamento linha → `Listing` (lib/queries.ts) com as colunas do P01, contra uma
 * Postgres LOCAL descartável.
 *
 * Duas promessas: (1) com as colunas novas a null — o estado da produção logo a
 * seguir à migration 0009 — o `Listing` sai IGUAL ao de antes (só a capa em
 * `images`, sem campos de IVA/margem no `cost`); (2) quando o pipeline as preenche,
 * chegam à UI: galeria, IVA declarado, comparáveis PT, a decomposição da margem,
 * as parcelas do ISV e o veredito de km da RDW.
 *
 * Sem Postgres local (ou sem permissão para criar bases) o teste salta.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import postgres from "postgres";
import { dbUrl } from "../../lib/db-url";
import {
  dropDatabases,
  migrate,
  recreateDatabases,
  skipUnlessLocalDb,
  withDbName,
} from "../helpers/db";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const LOCAL = dbUrl();
const skip = skipUnlessLocalDb("o teste do mapeamento (P01)");
const TEST_DB = "autoimport_p01_map_test";
const VM = "55555555-5555-5555-5555-555555555501";

function carro(externalId: string, over: Record<string, unknown> = {}) {
  return {
    source_site: "autoscout24.de",
    external_id: externalId,
    model_id: VM,
    make_raw: "Mapmarke",
    model_raw: "M1",
    year: 2022,
    km: 30_000,
    fuel: "gasolina",
    country: "DE",
    price: 20_000,
    detail_url: `https://ex.test/${externalId}`,
    image_url: "https://img.test/capa.jpg",
    match_confidence: "exato",
    ...over,
  };
}

function estimativa(listingId: string, over: Record<string, unknown> = {}) {
  return {
    listing_id: listingId,
    origin_price: 20_000,
    transport: 950,
    isv: 3_000,
    iuc: 200,
    legalization: 400,
    total_pt: 24_550,
    pt_estimated_price: 30_000,
    pt_sample_size: 8,
    pt_confidence: "normal",
    savings: 5_450,
    savings_pct: 18.2,
    verdict: "compensa",
    isv_table_year: 2026,
    ...over,
  };
}

test("colunas do P01: iguais a antes quando a null, e expostas quando preenchidas", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  const url = withDbName(LOCAL, TEST_DB);
  try {
    await recreateDatabases(LOCAL, TEST_DB);
    migrate(url);
  } catch (err) {
    t.skip(`não deu para criar a base de teste (${(err as Error).message.slice(0, 80)})`);
    return;
  }
  // `db/index.ts` resolve a ligação no import — tem de vir depois disto.
  process.env.WAREHOUSE_URL = url;

  const sql = postgres(url, { prepare: false });
  try {
    await sql`
      insert into vehicle_models (id, make, model, fuel, norm_key)
      values (${VM}, 'mapmarke', 'm1', 'gasolina', 'mapmarke|m1|gasolina')
    `;
    const [antigo] = await sql`insert into listings ${sql(carro("p01-antigo"))} returning id`;
    const [novo] = await sql`
      insert into listings ${sql(
        carro("p01-novo", {
          vat_regime: "dedutivel",
          price_net: 16_807,
          image_urls: ["https://img.test/1.jpg", "/relativa.jpg", "https://img.test/2.jpg"],
          km_check: sql.json({ source: "RDW", verdict: "coerente", checkedAt: "2026-10-01" }),
        }),
      )} returning id
    `;
    await sql`insert into import_cost_estimates ${sql(estimativa(antigo.id))}`;
    await sql`
      insert into import_cost_estimates ${sql(
        estimativa(novo.id, {
          vat_regime: "dedutivel",
          origin_price_net: 16_807,
          vat_deposit: 3_193,
          preparation: 300,
          despachante: 250,
          output_vat: 5_610,
          gross_margin: 2_483,
          gross_margin_pct: 8.28,
          inputs: sql.json({
            isv: {
              cilindrada: 830.12,
              ambiental: 2650.4,
              agravamentoDiesel: 0,
              taxaPct: 100,
              reducaoPct: 20,
              norm: "wltp",
              total: 2784.41,
              assumptions: ["norma CO₂ assumida WLTP (matrícula 2019, transição)"],
            },
          }),
          pt_sample: sql.json([
            {
              t: "Mapmarke M1",
              y: 2022,
              km: 25_000,
              p: 30_500,
              s: "standvirtual.com",
              u: "https://pt.test/1",
            },
            { t: "Mapmarke M1", y: 2021, km: 40_000, p: 29_000, s: "olx.pt" },
          ]),
        }),
      )}
    `;

    const { getListingQuery } = await import("../../lib/queries");

    const a = await getListingQuery(antigo.id as string, null);
    assert.ok(a);
    assert.deepEqual(a.images, ["https://img.test/capa.jpg"], "sem galeria: só a capa");
    assert.deepEqual(
      a.cost,
      {
        originPrice: 20_000,
        transport: 950,
        isv: 3_000,
        iuc: 200,
        legalization: 400,
        totalPt: 24_550,
      },
      "sem motor novo: o default 'margem' da migration NÃO aparece como facto",
    );
    assert.equal(a.sourceVatRegime, undefined);
    assert.equal(a.ptSample, undefined);
    assert.equal(a.isvParts, undefined, "sem inputs.isv: a ficha fica só com as regras");
    assert.equal(a.kmCheck, undefined);
    assert.deepEqual(a.kmTrust, { level: "por_verificar" });

    const n = await getListingQuery(novo.id as string, null);
    assert.ok(n);
    assert.deepEqual(
      n.images,
      ["https://img.test/1.jpg", "https://img.test/2.jpg"],
      "galeria, com o mesmo filtro de URLs da capa",
    );
    assert.equal(n.sourceVatRegime, "dedutivel");
    assert.deepEqual(n.cost, {
      originPrice: 20_000,
      transport: 950,
      isv: 3_000,
      iuc: 200,
      legalization: 400,
      totalPt: 24_550,
      vatRegime: "dedutivel",
      originPriceNet: 16_807,
      vatDeposit: 3_193,
      preparation: 300,
      despachante: 250,
      outputVat: 5_610,
      grossMargin: 2_483,
      grossMarginPct: n.cost.grossMarginPct,
    });
    assert.ok(Math.abs((n.cost.grossMarginPct ?? 0) - 8.28) < 1e-4);
    assert.deepEqual(n.isvParts, {
      cilindrada: 830.12,
      ambiental: 2650.4,
      agravamentoDiesel: 0,
      taxaPct: 100,
      reducaoPct: 20,
      norm: "wltp",
      assumptions: ["norma CO₂ assumida WLTP (matrícula 2019, transição)"],
    });
    assert.deepEqual(n.kmCheck, { source: "RDW", verdict: "coerente", checkedAt: "2026-10-01" });
    assert.deepEqual(n.kmTrust, { level: "verificado", source: "RDW" }, "RDW coerente: verificado");
    assert.deepEqual(n.ptSample, [
      {
        title: "Mapmarke M1",
        year: 2022,
        km: 25_000,
        price: 30_500,
        source: "standvirtual.com",
        url: "https://pt.test/1",
      },
      {
        title: "Mapmarke M1",
        year: 2021,
        km: 40_000,
        price: 29_000,
        source: "olx.pt",
        url: undefined,
      },
    ]);
  } finally {
    await sql.end({ timeout: 5 });
    const { closeDb } = await import("../../db");
    await closeDb();
  }
});

after(async () => {
  if (!skip) await dropDatabases(LOCAL, TEST_DB);
});
