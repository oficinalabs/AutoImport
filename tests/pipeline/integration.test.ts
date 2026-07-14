/**
 * Teste de integração do pipeline contra o Postgres local (docker):
 * ingest fixture → match-models → pt-market → compute-costs →
 * flag-opportunities. A fixture (tests/fixtures/pipeline) tem 20 anúncios PT
 * do mesmo modelo (mediana 30.000 €) + 3 BMW 320d DE com preços construídos
 * para dar compensa/marginal/nao_compensa + 1 Audi A6 sem amostra PT.
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
    select l.external_id, e.verdict, e.pt_confidence, e.pt_sample_size,
           e.total_pt, e.pt_estimated_price, e.savings, e.isv, e.iuc
    from listings l
    left join import_cost_estimates e on e.listing_id = l.id
    where l.external_id like 'fixture-de-%'
    order by l.external_id
  `)) as unknown as {
      external_id: string;
      verdict: string | null;
      pt_confidence: string | null;
      pt_sample_size: number | null;
      savings: number | null;
      isv: number | null;
    }[];

    assert.equal(estimates.length, 4);
    const byId = new Map(estimates.map((e) => [e.external_id, e]));

    const compensa = byId.get("fixture-de-1");
    assert.equal(compensa?.verdict, "compensa");
    assert.equal(compensa?.pt_confidence, "normal");
    assert.equal(compensa?.pt_sample_size, 20);
    assert.ok((compensa?.savings ?? 0) > 0);
    assert.ok((compensa?.isv ?? 0) > 1000, "ISV do 320d deve ser substancial");

    assert.equal(byId.get("fixture-de-2")?.verdict, "marginal");
    assert.equal(byId.get("fixture-de-3")?.verdict, "nao_compensa");
    // Audi sem amostra PT → sem estimativa (nunca adivinhar)
    assert.equal(byId.get("fixture-de-4")?.verdict, null);

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

after(async () => {
  if (!skip) {
    await cleanup();
    const { closeDb } = await import("../../db");
    await closeDb(); // liberta o event loop — sem isto o runner não termina
  }
});
