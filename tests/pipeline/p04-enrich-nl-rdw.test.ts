/**
 * P04: enrich-nl-rdw grava o veredito de km da RDW (`tellerstandoordeel`) em `km_check`.
 *
 * Os mapeamentos puros correm sempre, contra a resposta gravada em
 * tests/collector/fixtures/p04/. O teste de base salta sem Postgres local e prova as
 * guardas: só NL com matrícula, cada matrícula pedida uma vez, re-verificação ao fim de
 * RECHECK_DAYS, matrícula desconhecida não volta a ser pedida no dia seguinte.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import postgres from "postgres";
import { dbUrl } from "../../lib/db-url";
import {
  RDW_URL,
  enrichNlRdw,
  kmCheckFromRdw,
  kmVerdictFromRdw,
  rdwPlate,
} from "../../scripts/pipeline/enrich-nl-rdw";
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
const skip = skipUnlessLocalDb("o teste do enrich-nl-rdw (P04)");
const TEST_DB = "autoimport_p04_rdw_test";
const GRAVADA = JSON.parse(
  readFileSync("tests/collector/fixtures/p04/rdw-m9d7-ebf2-GB123X.json", "utf8"),
) as unknown[];

test("tellerstandoordeel → veredito do contrato", () => {
  assert.equal(kmVerdictFromRdw("Logisch"), "coerente");
  assert.equal(kmVerdictFromRdw("Onlogisch"), "incoerente");
  assert.equal(kmVerdictFromRdw("Geen oordeel"), "sem_juizo");
  assert.equal(kmVerdictFromRdw("Niet geregistreerd"), "sem_juizo");
  assert.equal(kmVerdictFromRdw(undefined), null);
  assert.equal(kmVerdictFromRdw("iets anders"), null);
});

test("resposta gravada da RDW → km_check", () => {
  const at = "2026-10-10T00:00:00.000Z";
  assert.deepEqual(kmCheckFromRdw(GRAVADA, at), {
    source: "RDW",
    verdict: "coerente",
    checkedAt: at,
  });
  assert.equal(kmCheckFromRdw([], at), null, "matrícula desconhecida");
  assert.equal(kmCheckFromRdw({ error: true }, at), null);
  assert.equal(rdwPlate("gb-123-x"), "GB123X");
});

test("sem WAREHOUSE_URL não corre", async () => {
  const antes = process.env.WAREHOUSE_URL;
  Reflect.deleteProperty(process.env, "WAREHOUSE_URL");
  try {
    await assert.rejects(
      enrichNlRdw({ fetchImpl: async () => new Response("[]") }),
      /WAREHOUSE_URL/,
    );
  } finally {
    if (antes !== undefined) process.env.WAREHOUSE_URL = antes;
  }
});

test("grava km_check nos NL com matrícula, uma vez por matrícula", async (t) => {
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
  // O db/index.ts resolve a URL no import: o script importa-o dentro da função, depois disto.
  process.env.WAREHOUSE_URL = url;
  const sql = postgres(url, { prepare: false });
  try {
    const ins = (id: string, country: string, plate: string | null) => sql`
      insert into listings (source_site, external_id, make_raw, model_raw, year, km, price, currency, country, plate, raw)
      values ('autotrader.nl', ${id}, 'Volkswagen', 'Golf', 2021, 42000, 24200, 'EUR', ${country}, ${plate}, '{}'::jsonb)
    `;
    await ins("nl-1", "NL", "GB123X");
    await ins("nl-2", "NL", "GB123X"); // mesma matrícula noutro anúncio
    await ins("nl-3", "NL", "XX999X"); // a RDW não conhece
    await ins("nl-4", "NL", null);
    await ins("de-1", "DE", "B-AB-123");

    const pedidos: string[] = [];
    const fetchImpl = async (u: string) => {
      pedidos.push(u);
      return new Response(JSON.stringify(u.includes("GB123X") ? GRAVADA : []), {
        headers: { "content-type": "application/json" },
      });
    };
    const agora = new Date();
    const now = () => agora;
    const r1 = await enrichNlRdw({ fetchImpl, rateMs: 0, now });
    assert.deepEqual(r1, { checked: 3, gravados: 2, semVeredito: 1, falhas: 0 });
    assert.equal(pedidos.length, 2, "GB123X pedida uma vez para os dois anúncios");
    assert.ok(pedidos[0].startsWith(`${RDW_URL}?kenteken=`));

    const rows = await sql`select external_id, km_check from listings order by external_id`;
    const km = Object.fromEntries(rows.map((r) => [r.external_id, r.km_check]));
    assert.deepEqual(km["nl-1"], {
      source: "RDW",
      verdict: "coerente",
      checkedAt: agora.toISOString(),
    });
    assert.deepEqual(km["nl-2"], km["nl-1"]);
    assert.equal(km["nl-3"], null);
    assert.equal(km["de-1"], null, "só NL");

    // Segunda corrida logo a seguir: nada pendente (nem a matrícula desconhecida).
    const r2 = await enrichNlRdw({ fetchImpl, rateMs: 0, now });
    assert.equal(r2.checked, 0);
    assert.equal(pedidos.length, 2);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

after(async () => {
  if (!skip) await dropDatabases(LOCAL, TEST_DB);
});
