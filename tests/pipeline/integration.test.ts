/**
 * Teste de integração do pipeline contra o Postgres local (docker):
 * ingest fixture → match-models → pt-market → compute-costs →
 * flag-opportunities. A fixture (tests/fixtures/pipeline) usa uma marca
 * SINTÉTICA ("Testmarke", specs de um 320d) para ser hermética contra uma
 * BD de dev com dados reais: 20 anúncios PT do mesmo modelo (mediana
 * 30.000 €) + 3 DE com preços construídos para dar compensa/marginal/
 * nao_compensa + 1 modelo sem amostra PT.
 * Sem DATABASE_URL (e sem docker) o teste é saltado.
 * Idempotente no fim: apaga tudo o que é `fixture-%`.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const DB_URL = process.env.DATABASE_URL;
const skip = !DB_URL ? "sem DATABASE_URL — teste de integração saltado" : false;

async function cleanup() {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    delete from pt_price_observations
    where listing_id in (select id from listings where external_id like 'fixture-%')
  `);
  await db.execute(sql`delete from listings where external_id like 'fixture-%'`);
  // catálogo sintético do teste de fronteira de geração (us_models→us_versions)
  await db.execute(sql`delete from us_versions where mid like 'TG-%'`);
  await db.execute(sql`delete from us_models where mid like 'TG-%'`);
  // modelos das marcas sintéticas criados pelo match-models/pelos fixtures — sem
  // isto ficam na BD partilhada
  await db.execute(sql`delete from vehicle_models where make in ('testmarke', 'testgen')`);
}

test(
  "pipeline ponta-a-ponta: fixture → vereditos e oportunidade",
  { skip, timeout: 120_000 },
  async () => {
    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");
    const { matchModels } = await import("../../scripts/pipeline/match-models");
    const { collectPtObservations } = await import("../../scripts/pipeline/pt-market");
    const { computeCosts } = await import("../../scripts/pipeline/compute-costs");
    const { flagOpportunities } = await import("../../scripts/pipeline/flag-opportunities");

    await cleanup(); // estado limpo mesmo depois de um run falhado

    // 1. ingest da fixture (processo separado — o script gere a própria ligação)
    execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/pipeline/ingest.ts", "--dir", "tests/fixtures/pipeline"],
      { stdio: "pipe" },
    );

    // 2–5. matching, observações PT, custos, oportunidades
    await matchModels();
    await collectPtObservations();
    await computeCosts();
    await flagOpportunities();

    // Vereditos por anúncio da fixture
    const estimates = (await db.execute(sql`
    select l.external_id, l.price, e.verdict, e.pt_confidence, e.pt_sample_size,
           e.total_pt, e.pt_estimated_price, e.savings, e.isv, e.iuc, e.origin_price
    from listings l
    left join import_cost_estimates e on e.listing_id = l.id
    where l.external_id like 'fixture-de-%'
    order by l.external_id
  `)) as unknown as {
      external_id: string;
      price: number;
      verdict: string | null;
      pt_confidence: string | null;
      pt_sample_size: number | null;
      savings: number | null;
      isv: number | null;
      origin_price: number | null;
    }[];

    assert.equal(estimates.length, 6);
    const byId = new Map(estimates.map((e) => [e.external_id, e]));

    const compensa = byId.get("fixture-de-1");
    assert.equal(compensa?.verdict, "compensa");
    assert.equal(compensa?.pt_confidence, "normal");
    assert.equal(compensa?.pt_sample_size, 20);
    assert.ok((compensa?.savings ?? 0) > 0);
    assert.ok((compensa?.isv ?? 0) > 1000, "ISV (specs de 320d) deve ser substancial");

    assert.equal(byId.get("fixture-de-2")?.verdict, "marginal");
    assert.equal(byId.get("fixture-de-3")?.verdict, "nao_compensa");
    // modelo sem amostra PT → sem estimativa (nunca adivinhar)
    assert.equal(byId.get("fixture-de-4")?.verdict, null);
    // leilão (autoline /leilao/): o preço é licitação corrente, nunca há estimativa
    assert.equal(byId.get("fixture-de-5")?.verdict, null);
    // fonte ES com cash_price estruturado: o preço guardado/usado é o contado
    assert.equal(byId.get("fixture-de-6")?.price, 24000);
    assert.equal(byId.get("fixture-de-6")?.origin_price, 24000);

    // Oportunidade ativa apenas para o compensa
    const opps = (await db.execute(sql`
    select l.external_id
    from opportunities o
    join listings l on l.id = o.listing_id
    where o.deleted_at is null and l.external_id like 'fixture-%'
  `)) as unknown as { external_id: string }[];
    assert.deepEqual(
      opps.map((o) => o.external_id),
      ["fixture-de-1"],
    );
  },
);

test(
  "guarda de janela de geração (fronteira F56/J01): a mediana PT não contamina da geração velha",
  { skip, timeout: 120_000 },
  async () => {
    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");
    const { collectPtObservations } = await import("../../scripts/pipeline/pt-market");
    const { computeCosts } = await import("../../scripts/pipeline/compute-costs");
    const { estimatePtPrice } = await import("../../lib/engine/pt-market");

    await cleanup();

    // Catálogo sintético: família `testgen|genmodel` com DUAS gerações datadas —
    // velha (arranque 2019) → janela [2018,2021]; nova (arranque 2022) → [2022,null].
    // Janelas DISJUNTAS (sem o −1 de graça interno): o ano de fronteira 2021 fica
    // na geração velha e o 2022 na nova, sem sobreposição.
    await db.execute(sql`
      insert into us_models (mid, make, model, slug, model_year, url) values
        ('TG-OLD', 'Testgen', 'GenModel', 'GenModel-Gen1', 2019, 'https://example.test/old'),
        ('TG-NEW', 'Testgen', 'GenModel', 'GenModel-Gen2', 2022, 'https://example.test/new')
    `);
    await db.execute(sql`
      insert into us_versions
        (version_id, mid, name, url, fuel_section, fuel, year, power_hp, displacement_cc, co2_wltp) values
        ('V-OLD', 'TG-OLD', 'GenModel 1.0', 'https://example.test/vold', 'petrol', 'Petrol', 2019, 130, 1500, 140),
        ('V-NEW', 'TG-NEW', 'GenModel 1.0', 'https://example.test/vnew', 'petrol', 'Petrol', 2022, 130, 1500, 135)
    `);

    // Modelo canónico (o matching de versão é agnóstico à geração: as observações
    // PT das duas gerações partilham o model_id — é a janela que as separa).
    const [model] = (await db.execute(sql`
      insert into vehicle_models (make, model, fuel, norm_key)
      values ('testgen', 'genmodel', 'gasolina', 'testgen|genmodel|gasolina')
      returning id
    `)) as unknown as { id: string }[];
    const modelId = model.id;

    // PT: 5 carros da geração VELHA (2021, baratos) + 5 da NOVA (2022, caros),
    // mesma banda de km e potência. Sem guarda, a mediana de um 2022 mistura ambas.
    const ptRows = [
      ...[15800, 16100, 16400, 16700, 17000].map((price, i) => ({
        y: 2021,
        price,
        id: `fixture-gen-pt-old-${i}`,
        seller: `Stand Velho ${i}`,
      })),
      ...[30000, 30300, 30600, 30900, 31200].map((price, i) => ({
        y: 2022,
        price,
        id: `fixture-gen-pt-new-${i}`,
        seller: `Stand Novo ${i}`,
      })),
    ];
    for (const r of ptRows) {
      await db.execute(sql`
        insert into listings
          (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
           year, km, power_hp, price, country, seller_name, detail_url)
        values
          ('standvirtual.com', ${r.id}, ${modelId}, 'Testgen', 'GenModel', 'Gasolina', 'gasolina',
           'GenModel 1.0', ${r.y}, 30000, 130, ${r.price}, 'PT', ${r.seller},
           ${`https://example.test/${r.id}`})
      `);
    }

    // Estrangeiro da geração NOVA (2022): confirmado à versão V-NEW; sem CO₂ próprio
    // (vem do catálogo). Preço baixo → a comparação assenta na mediana PT.
    await db.execute(sql`
      insert into listings
        (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
         year, km, power_hp, displacement_cc, co2, price, country, detail_url, first_registration,
         us_version_id, match_confidence, match_evidence)
      values
        ('autoscout24.de', 'fixture-gen-de-1', ${modelId}, 'Testgen', 'GenModel', 'Gasolina', 'gasolina',
         'GenModel 1.0', 2022, 30000, 130, 1500, null, 18000, 'DE', 'https://example.test/gen-de-1',
         '2022-06-01', 'V-NEW', 'confirmado', ${JSON.stringify({ geracaoAmbigua: false })}::jsonb)
    `);

    await collectPtObservations();
    await computeCosts();

    // 1) Prova positiva (ponta-a-ponta): o compute-costs deriva a janela da versão
    //    confirmada e a mediana PT usa SÓ os carros da geração nova.
    const [est] = (await db.execute(sql`
      select e.pt_estimated_price, e.pt_sample_size, e.inputs
      from import_cost_estimates e
      join listings l on l.id = e.listing_id
      where l.external_id = 'fixture-gen-de-1'
    `)) as unknown as {
      pt_estimated_price: number;
      pt_sample_size: number;
      inputs: {
        versionId?: string;
        fromCatalog?: string[];
        genWindow?: { start: number; end: number | null } | null;
      };
    }[];
    assert.ok(est, "o estrangeiro confirmado recebeu estimativa");
    assert.ok(
      est.pt_estimated_price >= 30000,
      `mediana limpa da geração nova (obtido ${est.pt_estimated_price})`,
    );
    assert.equal(est.pt_sample_size, 5, "amostra só dos 5 carros da geração nova");
    // proveniência auditável: version_id + CO₂ do catálogo + janela derivada
    assert.equal(est.inputs.versionId, "V-NEW");
    assert.ok(est.inputs.fromCatalog?.includes("co2"), "CO₂ efetivo veio do catálogo");
    assert.equal(est.inputs.genWindow?.start, 2022);

    // 2) Prova negativa: a MESMA amostra, sem a guarda, é contaminada pela geração
    //    velha (mediana entre os dois blocos de preço).
    const semGuarda = await estimatePtPrice(db, modelId, 2022, 1, 130);
    const comGuarda = await estimatePtPrice(db, modelId, 2022, 1, 130, { start: 2022, end: null });
    assert.ok(semGuarda, "amostra sem guarda existe");
    assert.ok(comGuarda, "amostra com guarda existe");
    assert.ok(
      semGuarda.estimatedPrice < 30000,
      `sem guarda a mediana é contaminada (${semGuarda.estimatedPrice})`,
    );
    assert.ok(
      comGuarda.estimatedPrice >= 30000,
      `com guarda a mediana fica limpa (${comGuarda.estimatedPrice})`,
    );
    assert.notEqual(semGuarda.estimatedPrice, comGuarda.estimatedPrice);
  },
);

after(async () => {
  if (!skip) {
    await cleanup();
    const { closeDb } = await import("../../db");
    await closeDb(); // liberta o event loop — sem isto o runner não termina
  }
});
