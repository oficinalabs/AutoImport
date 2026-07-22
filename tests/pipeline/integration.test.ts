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
// Guarda anti-produção: este teste ESCREVE (ingest de fixtures, deletes no
// cleanup) e o .env.local aponta para a Supabase REAL — correr `pnpm test` com
// ele carregado já deixou resíduos na montra ("Testgen GenModel 1.0"). Só corre
// contra Postgres LOCAL (docker `pnpm db:up` ou o serviço do CI, ambos em
// localhost); URL não-local ou ilegível → salta.
function isLocal(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
const skip = !DB_URL
  ? "sem DATABASE_URL — teste de integração saltado"
  : !isLocal(DB_URL)
    ? "DATABASE_URL não é local — o teste de integração escreve; só docker/CI"
    : false;

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
  await db.execute(
    sql`delete from vehicle_models where make in ('testmarke', 'testgen', 'testcross')`,
  );
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
    // Os slugs marcam a geração por NÚMERO NU (GenModel-1/-2, como Golf-7/-8) — token de
    // uma cifra é ruído no cálculo do derivado, por isso ambas as gerações ficam na MESMA
    // linha de derivado (base ""), que é onde o encadeamento por linha as separa por janela.
    await db.execute(sql`
      insert into us_models (mid, make, model, slug, model_year, url) values
        ('TG-OLD', 'Testgen', 'GenModel', 'GenModel-1', 2019, 'https://example.test/old'),
        ('TG-NEW', 'Testgen', 'GenModel', 'GenModel-2', 2022, 'https://example.test/new')
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

    // Estrangeiro da geração NOVA (2022): tier 'exato' à versão V-NEW; sem
    // CO₂ próprio (vem do catálogo). Preço baixo → a comparação assenta na
    // mediana PT.
    await db.execute(sql`
      insert into listings
        (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
         year, km, power_hp, displacement_cc, co2, price, country, detail_url, first_registration,
         us_version_id, match_confidence, match_evidence)
      values
        ('autoscout24.de', 'fixture-gen-de-1', ${modelId}, 'Testgen', 'GenModel', 'Gasolina', 'gasolina',
         'GenModel 1.0', 2022, 30000, 130, 1500, null, 18000, 'DE', 'https://example.test/gen-de-1',
         '2022-06-01', 'V-NEW', 'exato', ${JSON.stringify({ geracaoAmbigua: false })}::jsonb)
    `);

    // Segundo estrangeiro da geração NOVA: tier 'designacao' (motor provado,
    // variante não única) — sem versão, com factos gravados. Sem CO₂ próprio → o
    // CO₂ efetivo vem dos factos; a amostra PT confina-se à geração nova.
    await db.execute(sql`
      insert into listings
        (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
         year, km, power_hp, displacement_cc, co2, price, country, detail_url, first_registration,
         us_version_id, match_confidence, designation_facts)
      values
        ('autoscout24.de', 'fixture-gen-de-2', ${modelId}, 'Testgen', 'GenModel', 'Gasolina', 'gasolina',
         'GenModel 1.0', 2022, 30000, 130, 1500, null, 18500, 'DE', 'https://example.test/gen-de-2',
         '2022-06-01', null, 'designacao',
         ${JSON.stringify({ displacementCc: 1500, co2Wltp: 138, co2Nedc: null, powerHp: 130, mid: "TG-NEW", genWindow: { start: 2022, end: null }, versions: 2 })}::jsonb)
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
        matchKind?: string;
        versionId?: string;
        fromCatalog?: string[];
        genWindow?: { start: number; end: number | null } | null;
      };
    }[];
    assert.ok(est, "o estrangeiro exato recebeu estimativa");
    assert.ok(
      est.pt_estimated_price >= 30000,
      `mediana limpa da geração nova (obtido ${est.pt_estimated_price})`,
    );
    assert.equal(est.pt_sample_size, 5, "amostra só dos 5 carros da geração nova");
    // proveniência auditável: o tier exato grava matchKind 'exato' + version_id
    // + CO₂ do catálogo + janela derivada
    assert.equal(est.inputs.matchKind, "exato", "tier exato grava matchKind 'exato'");
    assert.equal(est.inputs.versionId, "V-NEW");
    assert.ok(est.inputs.fromCatalog?.includes("co2"), "CO₂ efetivo veio do catálogo");
    assert.equal(est.inputs.genWindow?.start, 2022);

    // Ramo designacao: o segundo estrangeiro recebe estimativa a partir dos
    // factos (CO₂ dos factos, sem versão), com a amostra PT confinada à nova.
    const [estDes] = (await db.execute(sql`
      select e.pt_sample_size, e.inputs
      from import_cost_estimates e
      join listings l on l.id = e.listing_id
      where l.external_id = 'fixture-gen-de-2'
    `)) as unknown as {
      pt_sample_size: number;
      inputs: {
        matchKind?: string;
        versionId?: string;
        fromCatalog?: string[];
        genWindow?: { start: number } | null;
      };
    }[];
    assert.ok(estDes, "o estrangeiro designacao recebeu estimativa");
    assert.equal(estDes.inputs.matchKind, "designacao");
    assert.equal(estDes.inputs.versionId, undefined, "designacao não grava versionId");
    assert.ok(estDes.inputs.fromCatalog?.includes("co2"), "CO₂ efetivo veio dos factos");
    assert.equal(estDes.inputs.genWindow?.start, 2022);
    assert.equal(estDes.pt_sample_size, 5, "amostra só dos 5 carros da geração nova");

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

test(
  "guarda de derivado/corpo (excludeMids): Gran Tourer não compara com Gran Coupe",
  { skip, timeout: 120_000 },
  async () => {
    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");
    const { collectPtObservations } = await import("../../scripts/pipeline/pt-market");
    const { computeCosts } = await import("../../scripts/pipeline/compute-costs");
    const { estimatePtPrice } = await import("../../lib/engine/pt-market");

    await cleanup();

    // Catálogo sintético: dois mids da MESMA família/geração (arranque 2022, motor
    // idêntico 130cv/1500cc) mas corpos distintos — TG-BASE (sedan/hatch, derivado
    // "") e TG-CAB (cabrio, derivado "cabrio"). O genKeyOf tira "cabrio"
    // (BODY_TOKEN) → fundem-se na mesma geração; só o DERIVADO os separa.
    await db.execute(sql`
      insert into us_models (mid, make, model, slug, model_year, url) values
        ('TG-BASE', 'Testgen', 'GenTwo', 'GenTwo-Gen1', 2022, 'https://example.test/base'),
        ('TG-CAB', 'Testgen', 'GenTwo', 'GenTwo-Gen1-Cabrio', 2022, 'https://example.test/cab')
    `);
    await db.execute(sql`
      insert into us_versions
        (version_id, mid, name, url, fuel_section, fuel, year, power_hp, displacement_cc, co2_wltp) values
        ('V-BASE', 'TG-BASE', 'GenTwo 1.0', 'https://example.test/vbase', 'petrol', 'Petrol', 2022, 130, 1500, 135),
        ('V-CAB', 'TG-CAB', 'GenTwo 1.0 Cabrio', 'https://example.test/vcab', 'petrol', 'Petrol', 2022, 130, 1500, 148)
    `);

    const [model] = (await db.execute(sql`
      insert into vehicle_models (make, model, fuel, norm_key)
      values ('testgen', 'gentwo', 'gasolina', 'testgen|gentwo|gasolina')
      returning id
    `)) as unknown as { id: string }[];
    const modelId = model.id;

    // PT (todos 2022, MESMA banda de km/potência): 5 BASE (~30 k, sem versão → mid
    // desconhecido, ficam na amostra) + 5 CABRIO caros (~45 k, us_version_id=V-CAB
    // → mid TG-CAB provado). Sem excludeMids os cabrios inflam a mediana do base.
    for (const [i, price] of [30000, 30300, 30600, 30900, 31200].entries()) {
      await db.execute(sql`
        insert into listings
          (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
           year, km, power_hp, price, country, seller_name, detail_url)
        values
          ('standvirtual.com', ${`fixture-deriv-pt-base-${i}`}, ${modelId}, 'Testgen', 'GenTwo',
           'Gasolina', 'gasolina', 'GenTwo 1.0', 2022, 30000, 130, ${price}, 'PT',
           ${`Stand Base ${i}`}, ${`https://example.test/fixture-deriv-pt-base-${i}`})
      `);
    }
    for (const [i, price] of [45000, 45250, 45500, 45750, 46000].entries()) {
      await db.execute(sql`
        insert into listings
          (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
           year, km, power_hp, price, country, seller_name, detail_url,
           us_version_id, match_confidence)
        values
          ('standvirtual.com', ${`fixture-deriv-pt-cab-${i}`}, ${modelId}, 'Testgen', 'GenTwo',
           'Gasolina', 'gasolina', 'GenTwo 1.0 Cabrio', 2022, 30000, 130, ${price}, 'PT',
           ${`Stand Cabrio ${i}`}, ${`https://example.test/fixture-deriv-pt-cab-${i}`},
           'V-CAB', 'exato')
      `);
    }

    // Estrangeiro BASE (exato V-BASE, derivado ""), com match_evidence.family para
    // o compute-costs derivar o excludeMids. Preço baixo → assenta na mediana PT.
    await db.execute(sql`
      insert into listings
        (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
         year, km, power_hp, displacement_cc, co2, price, country, detail_url, first_registration,
         us_version_id, match_confidence, match_evidence)
      values
        ('autoscout24.de', 'fixture-deriv-de-1', ${modelId}, 'Testgen', 'GenTwo', 'Gasolina', 'gasolina',
         'GenTwo 1.0', 2022, 30000, 130, 1500, null, 18000, 'DE', 'https://example.test/deriv-de-1',
         '2022-06-01', 'V-BASE', 'exato',
         ${JSON.stringify({ geracaoAmbigua: false, family: "testgen|gentwo" })}::jsonb)
    `);

    await collectPtObservations();
    await computeCosts();

    // Ponta-a-ponta: o compute-costs deriva o excludeMids (mids da família com
    // derivado ≠ ""), exclui os cabrios (TG-CAB) e a amostra fica só nos 5 base.
    const [est] = (await db.execute(sql`
      select e.pt_estimated_price, e.pt_sample_size, e.inputs
      from import_cost_estimates e
      join listings l on l.id = e.listing_id
      where l.external_id = 'fixture-deriv-de-1'
    `)) as unknown as {
      pt_estimated_price: number;
      pt_sample_size: number;
      inputs: { derivative?: string };
    }[];
    assert.ok(est, "o estrangeiro base recebeu estimativa");
    assert.equal(est.pt_sample_size, 5, "amostra só dos 5 base (cabrios excluídos)");
    assert.ok(
      est.pt_estimated_price < 32000,
      `mediana dos base, sem os cabrios caros (obtido ${est.pt_estimated_price})`,
    );
    assert.equal(est.inputs.derivative, "", "inputs regista o derivado base ''");

    // Prova direta: excluir o mid do outro derivado baixa a mediana — só APERTA.
    const comExcl = await estimatePtPrice(db, modelId, 2022, 1, 130, undefined, ["TG-CAB"]);
    const semExcl = await estimatePtPrice(db, modelId, 2022, 1, 130);
    assert.ok(comExcl && semExcl, "ambas as amostras existem");
    assert.equal(comExcl.sampleSize, 5, "excluir os cabrios deixa só os 5 base");
    assert.ok(
      comExcl.estimatedPrice < semExcl.estimatedPrice,
      `excluir o derivado cabrio baixa a mediana (com=${comExcl.estimatedPrice} sem=${semExcl.estimatedPrice})`,
    );
  },
);

test(
  "dedupe de cross-listing (chassis no URL): caetano + carplus contam 1× na amostra",
  { skip, timeout: 120_000 },
  async () => {
    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");
    const { collectPtObservations } = await import("../../scripts/pipeline/pt-market");
    const { estimatePtPrice } = await import("../../lib/engine/pt-market");
    const { kmBand } = await import("../../lib/engine/normalize-vehicle");

    await cleanup();

    const [model] = (await db.execute(sql`
      insert into vehicle_models (make, model, fuel, norm_key)
      values ('testcross', 'atto-2', 'elétrico', 'testcross|atto-2|elétrico')
      returning id
    `)) as unknown as { id: string }[];
    const modelId = model.id;

    // 5 carros PT distintos (vendedores e preços distintos, sem chassis no URL →
    // caem na identidade por modelo+ano+km+preço) + 1 DUPLICADO do carro 1: o
    // MESMO chassis (lgxce4cb3t2078822) no slug do URL, mas noutro portal e com
    // preço/km ligeiramente diferentes — o cross-listing real caetano↔carplus.
    // Sem o dedupe por VIN-no-URL contava 6; com ele, 5.
    const chassisCaetano = "https://www.caetano.pt/usados/byd-atto-2-boost-lgxce4cb3t2078822";
    const chassisCarplus =
      "https://www.carplus.pt/viatura/byd-atto-2-boost-lgxce4cb3t2078822-usado";
    const cars = [
      { id: "fixture-cross-pt-1", price: 30000, km: 30000, seller: "Caetano", url: chassisCaetano },
      // duplicado do 1: chassis igual, portal/preço/km diferentes → mesma identidade
      {
        id: "fixture-cross-pt-1b",
        price: 30150,
        km: 30500,
        seller: "CarPlus",
        url: chassisCarplus,
      },
      {
        id: "fixture-cross-pt-2",
        price: 30200,
        km: 30000,
        seller: "Stand Dois",
        url: "https://example.test/fixture-cross-pt-2",
      },
      {
        id: "fixture-cross-pt-3",
        price: 30400,
        km: 30000,
        seller: "Stand Três",
        url: "https://example.test/fixture-cross-pt-3",
      },
      {
        id: "fixture-cross-pt-4",
        price: 30600,
        km: 30000,
        seller: "Stand Quatro",
        url: "https://example.test/fixture-cross-pt-4",
      },
      {
        id: "fixture-cross-pt-5",
        price: 30800,
        km: 30000,
        seller: "Stand Cinco",
        url: "https://example.test/fixture-cross-pt-5",
      },
    ];
    for (const c of cars) {
      await db.execute(sql`
        insert into listings
          (source_site, external_id, model_id, make_raw, model_raw, fuel_raw, fuel, variant,
           year, km, power_hp, price, country, seller_name, detail_url)
        values
          ('standvirtual.com', ${c.id}, ${modelId}, 'BYD', 'Atto 2', 'Elétrico', 'elétrico',
           'Atto 2 Boost', 2022, ${c.km}, 130, ${c.price}, 'PT', ${c.seller}, ${c.url})
      `);
    }

    await collectPtObservations();

    const est = await estimatePtPrice(db, modelId, 2022, kmBand(30000), 130);
    assert.ok(est, "amostra existe");
    assert.equal(est.sampleSize, 5, "o cross-listing caetano/carplus conta 1× (5 carros, não 6)");
    assert.equal(est.confidence, "normal", "5 carros, preços e vendedores distintos → normal");
  },
);

test(
  "re-crawl não desfaz o precio al contado (e desfaz quando o stand muda o preço)",
  { skip, timeout: 60_000 },
  async () => {
    const { db } = await import("../../db");
    const { sql } = await import("drizzle-orm");
    const { DbSink } = await import("../../tools/collector/lib/db-sink");

    await cleanup();

    // Anúncio ES como o coletor o vê: o preço de MONTRA é o financiado.
    const record = {
      id: "fixture-es-contado",
      source_site: "autoscout24.de",
      make: "Testmarke",
      model: "T900",
      variant: "T900d (contado ES)",
      year: 2023,
      km: 80000,
      fuel: "Gasolina",
      engine: "999 cm³",
      power_hp: 91,
      country: "SPAIN",
      price: 11900,
      detail_url: "https://www.autoscout24.de/angebote/fixture-es-contado",
      collected_at: "2000-01-01T00:00:00.000Z",
      source: "Fixture Concesionario",
      seller_type: "Dealer",
    };
    const sink = new DbSink(DB_URL as string);
    const state = async () => {
      const [row] = (await db.execute(sql`
        select l.price,
               (l.raw->>'precio_contado')::int as contado,
               (l.raw->>'precio_financiado')::int as financiado,
               (l.raw->>'precio_contado_checked') as checked,
               l.raw->>'variant' as raw_variant,
               (select count(*) from listing_price_history h where h.listing_id = l.id)::int as n_hist
        from listings l where l.external_id = 'fixture-es-contado'
      `)) as unknown as {
        price: number;
        contado: number | null;
        financiado: number | null;
        checked: string | null;
        raw_variant: string;
        n_hist: number;
      }[];
      return row;
    };

    try {
      await sink.upsertListing(record, "new", "autoscout24");
      assert.equal((await state()).price, 11900, "1.º crawl: fica o preço de montra");

      // O que o enrich-es faz quando encontra "Precio al contado: 12900 euros".
      await db.execute(sql`
        update listings set
          price = 12900,
          raw = raw::jsonb || jsonb_build_object(
            'precio_contado', 12900, 'precio_contado_checked', true, 'precio_financiado', 11900),
          updated_at = now()
        where external_id = 'fixture-es-contado'
      `);
      await db.execute(sql`
        insert into listing_price_history (listing_id, price)
        select id, 12900 from listings where external_id = 'fixture-es-contado'
      `);

      // 2.º crawl com o MESMO preço de montra: a correção sobrevive.
      await sink.upsertListing(
        { ...record, variant: "T900d (contado ES, re-crawl)" },
        "new",
        "autoscout24",
      );
      const depois = await state();
      assert.equal(depois.price, 12900, "o re-crawl não repõe o financiado");
      assert.equal(depois.contado, 12900, "a marca do contado sobrevive");
      assert.equal(depois.financiado, 11900, "o financiado observado sobrevive");
      assert.equal(depois.checked, "true", "a marca de verificado sobrevive");
      assert.equal(
        depois.raw_variant,
        "T900d (contado ES, re-crawl)",
        "o resto do raw é o registo fresco da fonte",
      );
      assert.equal(depois.n_hist, 2, "sem descida fantasma no histórico (11900 → 12900, e nada)");

      // 3.º crawl com o preço de montra MUDADO: o contado caduca e o anúncio
      // volta à fila do enrich (sem marcas).
      await sink.upsertListing({ ...record, price: 11500 }, "price_change", "autoscout24");
      const mudou = await state();
      assert.equal(mudou.price, 11500, "preço de montra novo manda");
      assert.equal(mudou.contado, null, "marca do contado largada");
      assert.equal(mudou.checked, null, "volta à fila do enrich");
      assert.equal(mudou.n_hist, 3, "a mudança real entra no histórico");
    } finally {
      await sink.close();
    }
  },
);

after(async () => {
  if (!skip) {
    await cleanup();
    const { closeDb } = await import("../../db");
    await closeDb(); // liberta o event loop — sem isto o runner não termina
  }
});
