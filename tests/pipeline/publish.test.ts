/**
 * Teste do publicador (scripts/pipeline/publish.ts) com DUAS bases LOCAIS: uma faz
 * de warehouse (origem) e outra de base da app (destino). Ambas são criadas do
 * zero a partir da Postgres local, migradas com o drizzle-kit e apagadas no fim —
 * a produção nunca entra nesta história (o `assertWritable` deixa passar destinos
 * locais, e só esses).
 *
 * A fixture é pequena e cobre o que pode partir em silêncio:
 *   1 exato+normal novo (com estimativa e oportunidade) · 1 exato+normal que o
 *   DESTINO já tem, com uuid próprio e um FAVORITO a apontar-lhe · 1 que morreu ·
 *   1 vivo que caiu da montra (confiança alargada) · 1 designacao (fora da montra)
 *   · 1 exato sem versão de catálogo (precisa do us_models pelo mid dos factos) ·
 *   observações PT dentro e fora da janela de 6 meses.
 *
 * Sem Postgres local (ou sem permissão para criar bases) o teste salta.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import postgres from "postgres";
import { dbUrl, isLocalDbUrl } from "../../lib/db-url";
import { publish } from "../../scripts/pipeline/publish";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const LOCAL = dbUrl();
const skip = !LOCAL
  ? "sem base de dados — teste do publicador saltado"
  : !isLocalDbUrl(LOCAL)
    ? "base de dados não é local — o publicador cria bases de teste; só local"
    : false;

const SRC_DB = "autoimport_publish_src_test";
const TGT_DB = "autoimport_publish_dst_test";

function withDbName(name: string): string {
  const url = new URL(LOCAL);
  url.pathname = `/${name}`;
  return url.toString();
}

const srcUrl = () => withDbName(SRC_DB);
const tgtUrl = () => withDbName(TGT_DB);

/** Cria as duas bases (destino migrado; origem clonada dele) do zero. */
async function bootstrap(): Promise<void> {
  const admin = postgres(withDbName("postgres"), { prepare: false, max: 1, onnotice: () => {} });
  try {
    for (const name of [SRC_DB, TGT_DB]) {
      await admin.unsafe(`drop database if exists ${name} with (force)`).simple();
    }
    await admin.unsafe(`create database ${TGT_DB}`).simple();
  } finally {
    await admin.end();
  }
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    stdio: "pipe",
    env: { ...process.env, WAREHOUSE_URL: tgtUrl(), DATABASE_URL: tgtUrl() },
  });
  const admin2 = postgres(withDbName("postgres"), { prepare: false, max: 1, onnotice: () => {} });
  try {
    // O esquema da origem é o mesmo — clonar evita segunda migração.
    await admin2.unsafe(`create database ${SRC_DB} template ${TGT_DB}`).simple();
  } finally {
    await admin2.end();
  }
}

async function dropDatabases(): Promise<void> {
  const admin = postgres(withDbName("postgres"), { prepare: false, max: 1, onnotice: () => {} });
  try {
    for (const name of [SRC_DB, TGT_DB]) {
      await admin.unsafe(`drop database if exists ${name} with (force)`).simple();
    }
  } finally {
    await admin.end();
  }
}

const SRC_SOURCE = "11111111-1111-1111-1111-111111111111";
const VM1 = "22222222-2222-2222-2222-222222222201";
const VM2 = "22222222-2222-2222-2222-222222222202";
const VM3 = "22222222-2222-2222-2222-222222222203";
const DEAD_AT = "2026-07-01 10:00:00";

type Sql = ReturnType<typeof postgres>;

/** Anúncio da fixture: só o que varia; o resto é o mesmo carro. */
function listing(external: string, over: Record<string, unknown> = {}) {
  return {
    source_site: "autoscout24.de",
    external_id: external,
    source_id: SRC_SOURCE,
    model_id: VM1,
    make_raw: "Pubmarke",
    model_raw: "P100",
    variant: "P100 1.0 T",
    year: 2022,
    km: 30000,
    fuel: "gasolina",
    gearbox: "manual",
    displacement_cc: 999,
    power_hp: 130,
    price: 18000,
    country: "DE",
    detail_url: `https://example.test/${external}`,
    us_version_id: "PF-V1",
    match_confidence: "exato",
    ...over,
  };
}

function estimate(listingId: string, confidence: string) {
  return {
    listing_id: listingId,
    origin_price: 18000,
    transport: 900,
    isv: 3000,
    iuc: 200,
    legalization: 400,
    total_pt: 22500,
    pt_estimated_price: 26000,
    pt_sample_size: 8,
    pt_confidence: confidence,
    savings: 3500,
    savings_pct: 13.5,
    verdict: "compensa",
    isv_table_year: 2026,
  };
}

async function seedSource(sql: Sql): Promise<void> {
  await sql`
    insert into sources (id, slug, name, country, kind)
    values (${SRC_SOURCE}, 'pubfix-as24', 'Fixture AS24', 'DE', 'marketplace')
  `;
  await sql`
    insert into vehicle_models (id, make, model, fuel, norm_key, power_hp) values
      (${VM1}, 'pubmarke', 'p100', 'gasolina', 'pubfix|p100|gasolina', 130),
      (${VM2}, 'pubmarke', 'p200', 'diesel', 'pubfix|p200|diesel', 150),
      (${VM3}, 'pubmarke', 'p300', 'gasolina', 'pubfix|p300|gasolina', 90)
  `;
  await sql`
    insert into us_models (mid, make, model, slug, model_year, url, image_urls) values
      ('PF-M1', 'Pubmarke', 'P100', 'P100-2022', 2022, 'https://example.test/m1',
       ${sql.json(["https://example.test/img1.jpg"])}),
      ('PF-M2', 'Pubmarke', 'P200', 'P200-2022', 2022, 'https://example.test/m2', null)
  `;
  await sql`
    insert into us_versions (version_id, mid, name, url, power_hp, displacement_cc)
    values ('PF-V1', 'PF-M1', 'P100 2022 1.0 T 130', 'https://example.test/v1', 130, 999)
  `;

  const rows = [
    listing("pub-fixture-1"),
    listing("pub-fixture-2"),
    listing("pub-fixture-3", { deleted_at: DEAD_AT }),
    listing("pub-fixture-4"),
    // designacao: motor provado, variante não única — NÃO é montra (só `exato`).
    listing("pub-fixture-5", {
      model_id: VM2,
      us_version_id: null,
      match_confidence: "designacao",
      designation_facts: sql.json({ mid: "PF-M2", powerHp: 150 }),
    }),
    // exato cujo `us_version_id` caiu (o catálogo largou a versão — a FK é
    // `on delete set null`): precisa do us_models pelo mid dos factos.
    listing("pub-fixture-6", {
      model_id: VM2,
      us_version_id: null,
      designation_facts: sql.json({ mid: "PF-M2", powerHp: 150 }),
    }),
    {
      source_site: "standvirtual.com",
      external_id: "pub-fixture-pt-1",
      model_id: VM1,
      make_raw: "Pubmarke",
      model_raw: "P100",
      year: 2022,
      km: 30000,
      price: 26000,
      country: "PT",
      detail_url: "https://example.test/pt-1",
    },
  ];
  for (const row of rows) await sql`insert into listings ${sql(row)}`;

  const ids = await sql`
    select id, external_id from listings where external_id like 'pub-fixture-%'
  `;
  const byExternal = new Map(ids.map((r) => [r.external_id as string, r.id as string]));
  for (const [external, confidence] of [
    ["pub-fixture-1", "normal"],
    ["pub-fixture-2", "normal"],
    ["pub-fixture-3", "normal"],
    // vivo, mas a amostra PT esticou → sai da montra sem morrer
    ["pub-fixture-4", "alargada"],
    ["pub-fixture-5", "normal"],
    ["pub-fixture-6", "normal"],
  ] as const) {
    const row = estimate(byExternal.get(external) as string, confidence);
    await sql`insert into import_cost_estimates ${sql(row)}`;
  }
  await sql`
    insert into opportunities (listing_id, savings, savings_pct)
    values (${byExternal.get("pub-fixture-1") as string}, 3500, 13.5)
  `;

  // Observações PT: A entra (janela de 6 meses, modelo publicado), B é velha
  // demais, C é de um modelo que não vai.
  const ptListing = byExternal.get("pub-fixture-pt-1") as string;
  await sql`
    insert into pt_price_observations (model_id, listing_id, year, km_band, price, source_site,
                                       observed_at) values
      (${VM1}, ${ptListing}, 2022, 1, 26000, 'standvirtual.com', now()),
      (${VM1}, null, 2022, 1, 24000, 'standvirtual.com', now() - interval '7 months'),
      (${VM3}, null, 2022, 1, 12000, 'standvirtual.com', now())
  `;
}

/** O destino como já está em produção: uuids próprios e dados de clientes. */
async function seedTarget(sql: Sql): Promise<Map<string, string>> {
  await sql`
    insert into organization (id, name, slug, created_at)
    values ('pubfix-org', 'Fixture Stand', 'fixture-stand', now())
  `;
  // Mesmas chaves naturais, uuids DIFERENTES dos da origem — é o que o
  // publicador tem de respeitar.
  const [tgtSource] = await sql`
    insert into sources (slug, name, country, kind)
    values ('pubfix-as24', 'Fixture AS24 (destino)', 'DE', 'marketplace')
    returning id
  `;
  const [tgtModel] = await sql`
    insert into vehicle_models (make, model, fuel, norm_key, power_hp)
    values ('pubmarke', 'p100', 'gasolina', 'pubfix|p100|gasolina', 130)
    returning id
  `;
  // O `pub-fixture-alheio` NÃO existe na origem — é de uma fonte que o corpus
  // local nunca recolheu. Caso real: em 27/07 o warehouse tinha 2 anúncios do
  // autoscout24.de e a produção tinha 295 na montra, vistos nesse mesmo dia.
  // Dá-los como mortos marcaria carros vivos como indisponíveis.
  for (const external of [
    "pub-fixture-2",
    "pub-fixture-3",
    "pub-fixture-4",
    "pub-fixture-alheio",
  ]) {
    await sql`
      insert into listings ${sql(
        listing(external, {
          source_id: tgtSource.id,
          model_id: tgtModel.id,
          // o catálogo ainda não foi publicado neste destino
          us_version_id: null,
        }),
      )}
    `;
  }
  const ids = await sql`
    select id, external_id from listings where external_id like 'pub-fixture-%'
  `;
  const byExternal = new Map(ids.map((r) => [r.external_id as string, r.id as string]));
  for (const external of [
    "pub-fixture-2",
    "pub-fixture-3",
    "pub-fixture-4",
    "pub-fixture-alheio",
  ]) {
    const row = estimate(byExternal.get(external) as string, "normal");
    await sql`insert into import_cost_estimates ${sql(row)}`;
  }
  // Um favorito de cliente e uma oportunidade que já não existe na origem.
  await sql`
    insert into favorites (stand_id, listing_id)
    values ('pubfix-org', ${byExternal.get("pub-fixture-2") as string})
  `;
  await sql`
    insert into opportunities (listing_id, savings, savings_pct)
    values (${byExternal.get("pub-fixture-2") as string}, 1000, 5)
  `;
  byExternal.set("__source", tgtSource.id as string);
  byExternal.set("__model", tgtModel.id as string);
  return byExternal;
}

/** Impressão digital do destino — para provar "nada mudou". */
async function fingerprint(sql: Sql): Promise<string> {
  const [row] = await sql`
    select
      (select coalesce(md5(string_agg(l::text, '|' order by l.id::text)), '') from listings l) ||
      (select coalesce(md5(string_agg(e::text, '|' order by e.id::text)), '')
         from import_cost_estimates e) ||
      (select coalesce(md5(string_agg(o::text, '|' order by o.id::text)), '')
         from opportunities o) ||
      (select coalesce(md5(string_agg(p::text, '|' order by p.id::text)), '')
         from pt_price_observations p) ||
      (select coalesce(md5(string_agg(v::text, '|' order by v.version_id)), '')
         from us_versions v) ||
      (select coalesce(md5(string_agg(f::text, '|' order by f.id::text)), '') from favorites f)
      as fp
  `;
  return row.fp as string;
}

test("publicação: montra completa, idempotente, com o id do destino a mandar", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  try {
    await bootstrap();
  } catch (err) {
    t.skip(`não deu para criar as bases de teste (${(err as Error).message.slice(0, 80)})`);
    return;
  }

  const src = postgres(srcUrl(), { prepare: false });
  const tgt = postgres(tgtUrl(), { prepare: false });
  try {
    await seedSource(src);
    const before = await seedTarget(tgt);
    const beforeFp = await fingerprint(tgt);

    // ── DRY-RUN: conta a sério, mas não deixa rasto ──
    const dry = await publish({ sourceUrl: srcUrl(), targetUrl: tgtUrl(), quiet: true });
    assert.equal(dry.applied, false);
    assert.equal(dry.montra, 3, "montra = os 3 exato+normal vivos (1, 2 e 6)");
    assert.equal(dry.montraNoDestino, 4, "o destino mostrava 2, 3, 4 e o alheio");
    assert.equal(dry.softDeleted, 1, "o 3 morreu — e SÓ ele: tem deleted_at na origem");
    assert.equal(dry.demoted, 1, "o 4 caiu da montra sem morrer");
    assert.equal(
      dry.unknownToSource,
      1,
      "o alheio não existe no corpus — ausência não é morte, não se lhe toca",
    );
    assert.equal(dry.opportunitiesDeactivated, 1, "a oportunidade do 2 já não existe na origem");
    assert.equal(dry.written.listings, 3);
    assert.equal(await fingerprint(tgt), beforeFp, "dry-run não escreveu nada");

    // ── A sério ──
    const run = await publish({
      sourceUrl: srcUrl(),
      targetUrl: tgtUrl(),
      apply: true,
      quiet: true,
    });
    assert.equal(run.applied, true);
    assert.deepEqual(
      { ...run.written },
      {
        vehicle_models: 2,
        sources: 1,
        us_models: 2,
        us_versions: 1,
        listings: 3,
        import_cost_estimates: 3,
        opportunities: 1,
        pt_price_observations: 1,
      },
      "escritas por tabela",
    );

    // 1. A montra do destino = o conjunto publicado ∪ o que o corpus desconhece.
    // Não é "exatamente o publicado": o publicador só manda no que a origem cobre.
    const montra = await tgt`
      select l.external_id from listings l
      join import_cost_estimates e on e.listing_id = l.id
      where l.deleted_at is null and l.match_confidence = 'exato'
        and e.pt_confidence = 'normal'
      order by l.external_id
    `;
    assert.deepEqual(
      montra.map((r) => r.external_id),
      ["pub-fixture-1", "pub-fixture-2", "pub-fixture-6", "pub-fixture-alheio"],
    );

    // 2. O uuid do destino é o que manda — e o favorito do cliente sobreviveu.
    const [kept] = await tgt`
      select id, us_version_id, price from listings where external_id = 'pub-fixture-2'
    `;
    assert.equal(kept.id, before.get("pub-fixture-2"), "o uuid remoto do anúncio 2 não mudou");
    const favs = await tgt`
      select f.stand_id, f.listing_id, l.external_id
      from favorites f join listings l on l.id = f.listing_id
    `;
    assert.equal(favs.length, 1, "o favorito continua lá");
    assert.equal(favs[0].external_id, "pub-fixture-2");
    assert.equal(favs[0].listing_id, before.get("pub-fixture-2"));

    // 3. O que morreu leva deleted_at (o da origem, ao segundo), não desaparece.
    // Comparado com a ORIGEM em texto: o postgres.js converte parâmetros string
    // que pareçam datas para o fuso local, portanto a constante da fixture não é
    // o que lá está gravado — o que importa provar é destino == origem.
    const at = (sql: Sql) =>
      sql`select deleted_at::text as at from listings where external_id = 'pub-fixture-3'`;
    const [deadSrc] = await at(src);
    const [deadTgt] = await at(tgt);
    assert.ok(deadTgt.at, "o 3 ficou marcado como morto");
    assert.equal(deadTgt.at, deadSrc.at, "propagou o deleted_at da origem, não a hora do ciclo");

    // 4. O que caiu da montra vivo é despromovido, NÃO marcado como indisponível.
    const [demoted] = await tgt`
      select l.deleted_at, e.pt_confidence from listings l
      join import_cost_estimates e on e.listing_id = l.id
      where l.external_id = 'pub-fixture-4'
    `;
    assert.equal(demoted.deleted_at, null, "o 4 continua à venda");
    assert.equal(demoted.pt_confidence, "alargada", "saiu da montra pela confiança, não por morte");

    // 4b. O que o corpus desconhece fica EXATAMENTE como estava. Sem isto, uma
    // fonte que o warehouse não recolheu levava a montra inteira dessa fonte a
    // "indisponível" — 295 carros vivos, no caso real que motivou esta guarda.
    const [alheio] = await tgt`
      select l.deleted_at, l.match_confidence, e.pt_confidence from listings l
      join import_cost_estimates e on e.listing_id = l.id
      where l.external_id = 'pub-fixture-alheio'
    `;
    assert.equal(alheio.deleted_at, null, "o alheio NÃO foi dado como morto");
    assert.equal(alheio.match_confidence, "exato", "nem despromovido");
    assert.equal(alheio.pt_confidence, "normal", "continua na montra do destino, intocado");

    // 5. `designacao` não é montra — não atravessa.
    const [{ n: designacao }] = await tgt`
      select count(*)::int as n from listings where external_id = 'pub-fixture-5'
    `;
    assert.equal(designacao, 0);

    // 6. O exato sem versão de catálogo levou o us_models pelo mid dos factos.
    const usModels = await tgt`select mid from us_models order by mid`;
    assert.deepEqual(
      usModels.map((r) => r.mid),
      ["PF-M1", "PF-M2"],
    );
    const usVersions = await tgt`select version_id, mid from us_versions`;
    assert.equal(usVersions.length, 1, "só a versão referenciada");
    assert.equal(usVersions.length, 1, "só a versão referenciada pela montra atravessa");

    // 7. Dimensões com uuid: uma linha por chave natural, e os anúncios apontam
    //    para o uuid do DESTINO.
    const models = await tgt`select id, norm_key from vehicle_models order by norm_key`;
    assert.equal(models.length, 2, "não duplicou o vehicle_models que já existia");
    const [one] = await tgt`
      select model_id, source_id from listings where external_id = 'pub-fixture-1'
    `;
    assert.equal(one.model_id, before.get("__model"), "model_id remapeado para o uuid do destino");
    assert.equal(one.source_id, before.get("__source"), "source_id remapeado");

    // 8. Oportunidades: a nova entra ativa, a que já não existe é desativada
    //    (soft), nunca apagada.
    const opps = await tgt`
      select l.external_id, o.deleted_at from opportunities o
      join listings l on l.id = o.listing_id
      order by l.external_id
    `;
    assert.deepEqual(
      opps.map((r) => [r.external_id, r.deleted_at === null]),
      [
        ["pub-fixture-1", true],
        ["pub-fixture-2", false],
      ],
    );

    // 9. Observações PT: só as dos modelos publicados e dentro dos 6 meses; o
    //    listing_id fica null quando o anúncio PT não foi publicado.
    const obs = await tgt`select model_id, listing_id, price from pt_price_observations`;
    assert.equal(obs.length, 1);
    assert.equal(obs[0].price, 26000);
    assert.equal(obs[0].model_id, before.get("__model"));
    assert.equal(obs[0].listing_id, null);

    // ── Idempotência: a segunda corrida não muda NADA ──
    const afterFirst = await fingerprint(tgt);
    const again = await publish({
      sourceUrl: srcUrl(),
      targetUrl: tgtUrl(),
      apply: true,
      quiet: true,
    });
    assert.deepEqual(
      Object.values(again.written),
      [0, 0, 0, 0, 0, 0, 0, 0],
      "segunda corrida: zero escritas",
    );
    assert.equal(again.softDeleted, 0);
    assert.equal(again.demoted, 0);
    assert.equal(again.opportunitiesDeactivated, 0);
    assert.equal(await fingerprint(tgt), afterFirst, "destino byte-a-byte igual");
  } finally {
    await src.end({ timeout: 5 });
    await tgt.end({ timeout: 5 });
  }
});

test("publicar de uma base para ela própria é recusado", async (t) => {
  if (skip) {
    t.skip(skip);
    return;
  }
  await assert.rejects(
    () => publish({ sourceUrl: LOCAL, targetUrl: LOCAL, quiet: true }),
    /MESMA base de dados/,
  );
});

after(async () => {
  if (!skip) await dropDatabases();
});
