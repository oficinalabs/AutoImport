/**
 * Testes dos ALERTAS ponta a ponta contra uma base descartável: o que a página
 * /alertas grava (lib/queries.ts) e o que o job casa
 * (scripts/pipeline/match-alerts.ts).
 *
 * O bug que isto fixa: um alerta criado em /alertas ia para a base sem
 * marca/modelo nenhum, e o matching comparava `lower(l.make_raw) =
 * lower(criteria->>'make')` — com o lado direito a NULL a comparação nunca é
 * verdadeira. TODOS os alertas da página nasciam mortos, em silêncio. O mesmo
 * para os países: `l.country = any('{}')` nunca é verdade.
 *
 * A fixture tem de propósito as grafias que existem no corpus real
 * (`VOLKSWAGEN`/`Volkswagen`/`VW`, `Golf`/`Golf VII`/`Golf 8`): são o mesmo
 * carro para quem compra, e o matching por texto cru tratava-as como modelos
 * diferentes.
 *
 * ⚠️ `process.env.WAREHOUSE_URL` tem de ser definido ANTES de qualquer
 * `await import("../../db")`: o db/index.ts congela a connection string no
 * import. Por isso os módulos são importados dentro dos testes.
 *
 * ⚠️ EMAILS: o `matchAlerts` envia um resumo por stand e o `sendTrialEmails`
 * os emails do trial. Aqui a `RESEND_API_KEY` é APAGADA do ambiente antes de
 * qualquer import — sem chave nenhum dos dois envia nada. Os testes dos emails
 * (P13, no fim) injetam um `send` falso que só regista e renderiza. Este teste
 * nunca pode falar com o mundo.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { render } from "@react-email/components";
import postgres from "postgres";
import { dbUrl } from "../../lib/db-url";
import type { SendEmailOptions } from "../../lib/email";
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

// Antes de tudo o resto: o lib/email.ts lê a chave no import do módulo.
process.env.RESEND_API_KEY = "";
// biome-ignore lint/performance/noDelete: tem de sair do ambiente, não ficar vazia
delete process.env.RESEND_API_KEY;

const DB_URL = dbUrl();
const skip = skipUnlessLocalDb("o teste dos alertas");
const TEST_DB = "autoimport_alerts_test";

const STAND_A = "stand-dos-alertas-a";
const STAND_B = "stand-dos-alertas-b";
const SOURCE = "44444444-4444-4444-4444-444444444401";
const VM_GOLF_DIESEL = "44444444-4444-4444-4444-444444444411";
const VM_GOLF_GASOLINA = "44444444-4444-4444-4444-444444444412";
const VM_ASTRA = "44444444-4444-4444-4444-444444444413";

/**
 * Anúncios da montra. Todos são oportunidades — o que se mede aqui é o
 * matching, não a elegibilidade.
 */
const FIXTURE = [
  // ext              make_raw       model_raw    país  modelo            totalPt
  ["golf-maiusc", "VOLKSWAGEN", "Golf", "DE", VM_GOLF_DIESEL, 25_000],
  ["golf-vii", "Volkswagen", "Golf VII", "FR", VM_GOLF_DIESEL, 22_000],
  ["golf-8-gasolina", "VW", "Golf 8", "ES", VM_GOLF_GASOLINA, 27_000],
  ["golf-caro", "Volkswagen", "Golf Variant", "DE", VM_GOLF_DIESEL, 60_000],
  ["astra", "OPEL", "Astra", "DE", VM_ASTRA, 18_000],
] as const;

/** id → external_id, para as asserções lerem nomes e não uuids. */
const extPorId = new Map<string, string>();

async function seedFixture(sql: ReturnType<typeof postgres>) {
  for (const [id, email] of [
    [STAND_A, "dono-a@exemplo-de-teste.pt"],
    [STAND_B, "dono-b@exemplo-de-teste.pt"],
  ] as const) {
    await sql`insert into organization (id, name, slug, created_at)
              values (${id}, ${id}, ${id}, now())`;
    // O `returning` do match-alerts junta member+user para saber a quem enviar;
    // sem dono, os matches criam-se mas não voltam do SQL.
    await sql`insert into "user" (id, name, email, created_at, updated_at)
              values (${`user-${id}`}, ${`Dono ${id}`}, ${email}, now(), now())`;
    await sql`insert into member (id, organization_id, user_id, role, created_at)
              values (${`member-${id}`}, ${id}, ${`user-${id}`}, 'owner', now())`;
  }

  await sql`insert into sources (id, slug, name, country, kind)
            values (${SOURCE}, 'testalerts', 'TestAlerts', 'DE', 'agregador')`;
  for (const [id, model, fuel] of [
    [VM_GOLF_DIESEL, "golf", "diesel"],
    [VM_GOLF_GASOLINA, "golf", "gasolina"],
    [VM_ASTRA, "astra", "diesel"],
  ] as const) {
    const make = model === "astra" ? "opel" : "volkswagen";
    await sql`insert into vehicle_models (id, norm_key, make, model, fuel)
              values (${id}, ${`${make}|${model}|${fuel}`}, ${make}, ${model}, ${fuel})`;
  }

  for (const [ext, makeRaw, modelRaw, country, modelId, totalPt] of FIXTURE) {
    const [row] = await sql`
      insert into listings (
        source_site, external_id, source_id, model_id, make_raw, model_raw,
        year, km, fuel, country, price, detail_url, match_confidence,
        first_seen_at, last_seen_at
      ) values (
        'testalerts.de', ${ext}, ${SOURCE}, ${modelId}, ${makeRaw}, ${modelRaw},
        2022, 40000, 'diesel', ${country}, ${totalPt - 5000},
        ${`https://testalerts.de/${ext}`}, 'exato', now(), now()
      ) returning id`;
    extPorId.set(row.id, ext);
    await sql`
      insert into import_cost_estimates (
        listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
        pt_estimated_price, pt_sample_size, pt_confidence, savings, savings_pct,
        verdict, isv_table_year
      ) values (
        ${row.id}, ${totalPt - 5000}, 1000, 3000, 200, 355, ${totalPt},
        ${totalPt + 5000}, 8, 'normal', 5000, 20, 'compensa', 2026
      )`;
    await sql`insert into opportunities (listing_id, savings, savings_pct)
              values (${row.id}, 5000, 20)`;
  }
}

let sql: ReturnType<typeof postgres> | null = null;
const db = () => sql as ReturnType<typeof postgres>;

before(async () => {
  if (skip) return;
  await recreateDatabases(DB_URL as string, TEST_DB);
  const url = withDbName(DB_URL as string, TEST_DB);
  migrate(url);
  process.env.WAREHOUSE_URL = url;
  sql = postgres(url, { prepare: false, onnotice: () => {} });
  await seedFixture(sql);
});

after(async () => {
  if (skip) return;
  await sql?.end();
  const { closeDb } = await import("../../db");
  await closeDb();
  await dropDatabases(DB_URL as string, TEST_DB);
});

/** Cria um alerta pelo MESMO caminho da página /alertas (lib/data.ts → queries). */
async function criarPelaPagina(
  standId: string,
  draft: {
    name: string;
    criteria?: string;
    countries?: string[];
    maxPrice?: number;
    makeKey?: string;
    modelKey?: string;
  },
) {
  const { createAlertMutation } = await import("../../lib/queries");
  await createAlertMutation(standId, {
    name: draft.name,
    criteria: draft.criteria ?? draft.name,
    // biome-ignore lint/suspicious/noExplicitAny: CountryCode é fechado; a fixture usa os mesmos códigos
    countries: (draft.countries ?? []) as any,
    maxPrice: draft.maxPrice,
    makeKey: draft.makeKey,
    modelKey: draft.modelKey,
  });
  const [row] = await db()`select id from alerts where name = ${draft.name}`;
  return row.id as string;
}

/** Os anúncios (por external_id) que um alerta já notificou. */
async function casados(alertId: string): Promise<string[]> {
  const rows = await db()`select listing_id from alert_events where alert_id = ${alertId}`;
  return rows.map((r) => extPorId.get(r.listing_id) ?? "?").sort();
}

async function correrMatching() {
  const { matchAlerts } = await import("../../scripts/pipeline/match-alerts");
  return matchAlerts();
}

test("um alerta criado na página /alertas casa mesmo — e ignora grafias", { skip }, async () => {
  // ISTO é o bug. Antes, o draft da página ia sem make/model e o matching
  // comparava com NULL: zero matches, para sempre, sem um aviso.
  const id = await criarPelaPagina(STAND_A, {
    name: "Golf da página",
    criteria: "Volkswagen Golf",
    makeKey: "volkswagen",
    modelKey: "golf",
    countries: ["DE", "FR", "ES"],
  });

  const r = await correrMatching();
  assert.equal(r.matched, 4, "os 4 Golfs — o Astra não");

  // VOLKSWAGEN/Volkswagen/VW e Golf/Golf VII/Golf 8/Golf Variant são o MESMO
  // modelo. E o diesel e o gasolina também: a família não se parte por
  // combustível, senão um alerta de "Golf" perdia metade dos Golfs.
  assert.deepEqual(await casados(id), ["golf-8-gasolina", "golf-caro", "golf-maiusc", "golf-vii"]);
});

test("correr outra vez não duplica eventos nem reenvia emails", { skip }, async () => {
  const antes = Number((await db()`select count(*) from alert_events`)[0].count);
  const r = await correrMatching();
  assert.equal(r.matched, 0, "nada de novo — logo, nenhum email");
  assert.equal(r.emailed, 0);
  const depois = Number((await db()`select count(*) from alert_events`)[0].count);
  assert.equal(depois, antes, "o unique(alert_id, listing_id) + on conflict é que segura isto");
});

test("countries vazio quer dizer TODOS os países", { skip }, async () => {
  const id = await criarPelaPagina(STAND_A, {
    name: "Golf sem países",
    makeKey: "volkswagen",
    modelKey: "golf",
    countries: [],
  });
  await correrMatching();
  assert.deepEqual(
    await casados(id),
    ["golf-8-gasolina", "golf-caro", "golf-maiusc", "golf-vii"],
    "DE, FR e ES — antes um alerta sem países não casava com nada",
  );
});

test("os países escolhidos filtram, e o preço máximo também", { skip }, async () => {
  const soFranca = await criarPelaPagina(STAND_A, {
    name: "Golf só de França",
    makeKey: "volkswagen",
    modelKey: "golf",
    countries: ["FR"],
  });
  const barato = await criarPelaPagina(STAND_A, {
    name: "Golf até 26 mil",
    makeKey: "volkswagen",
    modelKey: "golf",
    maxPrice: 26_000,
  });
  await correrMatching();

  assert.deepEqual(await casados(soFranca), ["golf-vii"]);
  assert.deepEqual(
    await casados(barato),
    ["golf-maiusc", "golf-vii"],
    "o de 27 000 e o de 60 000 ficam de fora (o custo final em PT, não o preço na origem)",
  );
});

test("alertas antigos, com marca/modelo em texto cru, continuam a casar", { skip }, async () => {
  // Compatibilidade: é assim que estão gravados os alertas criados a partir da
  // ficha de um anúncio, e há-os em produção. Nada foi migrado — as chaves são
  // derivadas na leitura, com o normalizador do pipeline.
  const [row] = await db()`
    insert into alerts (stand_id, name, criteria, countries, active)
    values (${STAND_A}, 'Alerta legado', ${db().json({ summary: "VOLKSWAGEN Golf VII", make: "VOLKSWAGEN", model: "Golf VII" })}, '{}', true)
    returning id`;
  await correrMatching();
  assert.deepEqual(
    await casados(row.id),
    ["golf-8-gasolina", "golf-caro", "golf-maiusc", "golf-vii"],
    "'VOLKSWAGEN'+'Golf VII' normaliza para a família volkswagen|golf",
  );
});

test("alerta sem modelo nenhum não casa — e a UI diz que não casa", { skip }, async () => {
  // O alerta que a página criava antes desta correção: só um resumo em texto.
  const [row] = await db()`
    insert into alerts (stand_id, name, criteria, countries, active)
    values (${STAND_A}, 'Texto livre', ${db().json({ summary: "Golf 2.0 TDI · < 30 000 €" })}, '{}', true)
    returning id`;
  await correrMatching();
  assert.deepEqual(await casados(row.id), [], "não há como casar texto livre");

  const { alertsQuery } = await import("../../lib/queries");
  const alerta = (await alertsQuery(STAND_A)).find((a) => a.id === row.id);
  assert.equal(alerta?.matchable, false, "e não pode ficar a fingir que vigia");
});

test("matchCount e lastMatchAt saem dos eventos reais", { skip }, async () => {
  const { alertsQuery } = await import("../../lib/queries");
  const alertas = await alertsQuery(STAND_A);

  const golf = alertas.find((a) => a.name === "Golf da página");
  assert.equal(golf?.matchCount, 4, "estava escrito 0 à mão e o badge nunca aparecia");
  assert.equal(golf?.matchable, true);
  assert.ok(golf?.lastMatchAt, "e a data do último match existe");
  assert.ok(
    Date.now() - new Date(golf?.lastMatchAt as string).getTime() < 60_000,
    "acabou de acontecer",
  );

  const franca = alertas.find((a) => a.name === "Golf só de França");
  assert.equal(franca?.matchCount, 1, "um alerta sem eventos não desaparece nem conta a mais");

  // Um alerta de outro stand não pode entrar na lista deste.
  await criarPelaPagina(STAND_B, {
    name: "Golf do outro stand",
    makeKey: "volkswagen",
    modelKey: "golf",
  });
  assert.equal(
    (await alertsQuery(STAND_A)).some((a) => a.name === "Golf do outro stand"),
    false,
  );
});

test("apagar leva os eventos atrás — e só o dono do alerta o apaga", { skip }, async () => {
  const { alertsQuery, deleteAlertMutation } = await import("../../lib/queries");
  const alvo = (await alertsQuery(STAND_A)).find((a) => a.name === "Golf da página");
  assert.ok(alvo);

  // O ataque: o id do alerta é o único dado que vem do cliente. Sozinho não
  // pode chegar para apagar o alerta de outro stand.
  await deleteAlertMutation(STAND_B, alvo.id);
  assert.equal((await casados(alvo.id)).length, 4, "nada foi apagado");
  assert.ok((await alertsQuery(STAND_A)).some((a) => a.id === alvo.id));

  await deleteAlertMutation(STAND_A, alvo.id);
  assert.equal(
    (await alertsQuery(STAND_A)).some((a) => a.id === alvo.id),
    false,
  );
  assert.deepEqual(await casados(alvo.id), [], "o `on delete cascade` limpa os alert_events");
});

test("a lista de modelos do formulário só tem o que existe na montra", { skip }, async () => {
  const { alertModelsQuery } = await import("../../lib/queries");
  const opcoes = await alertModelsQuery();
  // O Golf aparece UMA vez, apesar de ter duas linhas em vehicle_models
  // (diesel e gasolina) — quem escolhe escolhe o modelo, não o combustível.
  assert.deepEqual(opcoes, [
    { makeKey: "opel", modelKey: "astra", label: "Opel Astra" },
    { makeKey: "volkswagen", modelKey: "golf", label: "Volkswagen Golf" },
  ]);
});

// ── P13: resumo diário por stand e emails do trial ─────────────────────────

const STAND_C = "stand-dos-alertas-c";

/** `send` falso: regista o email e renderiza-o (um template partido falha aqui). */
function caixaDeCorreio() {
  const enviados: (SendEmailOptions & { html: string })[] = [];
  const send = async (o: SendEmailOptions) => {
    enviados.push({ ...o, html: await render(o.react) });
  };
  return { enviados, send };
}

async function novoStand(id: string, email: string, idadeDias: number) {
  await db()`insert into organization (id, name, slug, created_at)
             values (${id}, ${id}, ${id}, now() - make_interval(hours => ${Math.round(idadeDias * 24)}))`;
  await db()`insert into "user" (id, name, email, created_at, updated_at)
             values (${`user-${id}`}, ${`Dono ${id}`}, ${email}, now(), now())`;
  await db()`insert into member (id, organization_id, user_id, role, created_at)
             values (${`member-${id}`}, ${id}, ${`user-${id}`}, 'owner', now())`;
}

async function novaOportunidade(ext: string, modelId: string, totalPt: number) {
  const [row] = await db()`
    insert into listings (
      source_site, external_id, source_id, model_id, make_raw, model_raw,
      year, km, fuel, country, price, detail_url, match_confidence,
      first_seen_at, last_seen_at
    ) values (
      'testalerts.de', ${ext}, ${SOURCE}, ${modelId}, 'OPEL', 'Astra',
      2023, 20000, 'diesel', 'DE', ${totalPt - 5000},
      ${`https://testalerts.de/${ext}`}, 'exato', now(), now()
    ) returning id`;
  extPorId.set(row.id, ext);
  await db()`
    insert into import_cost_estimates (
      listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
      pt_estimated_price, pt_sample_size, pt_confidence, savings, savings_pct,
      verdict, isv_table_year
    ) values (
      ${row.id}, ${totalPt - 5000}, 1000, 3000, 200, 355, ${totalPt},
      ${totalPt + 5000}, 8, 'normal', 5000, 20, 'compensa', 2026
    )`;
  await db()`insert into opportunities (listing_id, savings, savings_pct)
             values (${row.id}, 5000, 20)`;
}

async function correrMatchingCom(send: (o: SendEmailOptions) => Promise<void>) {
  const { matchAlerts } = await import("../../scripts/pipeline/match-alerts");
  return matchAlerts({ send });
}

test("P13: vários carros para o mesmo stand → UM email de resumo", { skip }, async () => {
  await novoStand(STAND_C, "dono-c@exemplo-de-teste.pt", 0);
  await criarPelaPagina(STAND_C, { name: "Golf do C", makeKey: "volkswagen", modelKey: "golf" });

  const { enviados, send } = caixaDeCorreio();
  const r = await correrMatchingCom(send);

  // 8 = os 4 Golfs para o C + os mesmos 4 para o "Golf do outro stand" (B),
  // criado num teste acima e ainda por casar.
  assert.equal(r.matched, 8, "o sino ganha um evento por carro e por alerta");
  assert.equal(r.emailed, 2, "um resumo por stand");
  const doC = enviados.filter((e) => e.to === "dono-c@exemplo-de-teste.pt");
  assert.equal(doC.length, 1, "um resumo, não quatro emails");
  assert.equal(doC[0].subject, "4 carros novos para os teus alertas");
  for (const t of [
    "VOLKSWAGEN Golf",
    "Volkswagen Golf VII",
    "VW Golf 8",
    "Volkswagen Golf Variant",
  ]) {
    assert.ok(doC[0].html.includes(t), `o resumo lista ${t}`);
  }
});

test("P13: segunda corrida no mesmo dia — o sino ganha, o email não", { skip }, async () => {
  await criarPelaPagina(STAND_C, { name: "Astra do C", makeKey: "opel", modelKey: "astra" });

  const { enviados, send } = caixaDeCorreio();
  const r = await correrMatchingCom(send);
  assert.equal(r.matched, 1, "o Astra entra no sino");
  assert.equal(enviados.length, 0, "no máximo um resumo por dia");
});

test(
  "P13: no dia seguinte, o resumo leva o que ficou de fora — e não repete",
  { skip },
  async () => {
    // Recua o stand C um dia inteiro: o resumo de "hoje" passa a ser o de ontem.
    await db()`update trial_email_log
             set sent_at = sent_at - interval '1 day',
                 kind = ${`digest:${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}`}
             where stand_id = ${STAND_C}`;
    await db()`update alert_events set sent_at = sent_at - interval '1 day'
             where alert_id in (select id from alerts where stand_id = ${STAND_C})`;
    await novaOportunidade("astra-novo", VM_ASTRA, 19_000);

    const { enviados, send } = caixaDeCorreio();
    await correrMatchingCom(send);

    const doC = enviados.filter((e) => e.to === "dono-c@exemplo-de-teste.pt");
    assert.equal(doC.length, 1);
    assert.equal(
      doC[0].subject,
      "2 carros novos para os teus alertas",
      "o Astra de ontem + o novo",
    );
    assert.ok(!doC[0].html.includes("Golf"), "os Golfs já foram no resumo anterior");
  },
);

test("P13: emails do trial — dia 1, 7 e 25, nunca a quem pagou", { skip }, async () => {
  await novoStand("trial-semana", "semana@exemplo-de-teste.pt", 6.5);
  await novoStand("trial-fim", "fim@exemplo-de-teste.pt", 24.5);
  await novoStand("trial-pago", "pago@exemplo-de-teste.pt", 6.5);
  await novoStand("trial-fora", "fora@exemplo-de-teste.pt", 12);
  await novoStand("trial-velho", "velho@exemplo-de-teste.pt", 40);
  await db()`insert into subscriptions (stand_id, polar_subscription_id, status, current_period_end)
             values ('trial-pago', 'sub_teste', 'ativa', now() + interval '30 days')`;

  const { sendTrialEmails } = await import("../../scripts/pipeline/trial-emails");
  const { enviados, send } = caixaDeCorreio();
  const r = await sendTrialEmails({ send });

  const para = (email: string) => enviados.filter((e) => e.to === email);
  assert.equal(para("semana@exemplo-de-teste.pt").length, 1);
  assert.match(para("semana@exemplo-de-teste.pt")[0].subject, /Uma semana/);
  assert.equal(para("fim@exemplo-de-teste.pt").length, 1);
  assert.match(para("fim@exemplo-de-teste.pt")[0].subject, /^O teu mês grátis acaba a \d+ de /);
  assert.ok(para("fim@exemplo-de-teste.pt")[0].html.includes("/stand"), "link para gerir");
  assert.equal(para("pago@exemplo-de-teste.pt").length, 0, "já pagou: nada");
  assert.equal(para("fora@exemplo-de-teste.pt").length, 0, "dia 13: nenhum email toca");
  assert.equal(para("velho@exemplo-de-teste.pt").length, 0, "trial acabado: nada");
  // Os stands criados hoje pela fixture estão no dia 1.
  assert.match(para("dono-a@exemplo-de-teste.pt")[0]?.subject ?? "", /Bem-vindo/);
  assert.equal(r.sent, enviados.length);
});

test("P13: o email do dia 7 não sai duas vezes", { skip }, async () => {
  const { sendTrialEmails } = await import("../../scripts/pipeline/trial-emails");

  const outra = caixaDeCorreio();
  await sendTrialEmails({ send: outra.send });
  assert.equal(outra.enviados.length, 0, "mesmo dia: nada de novo");

  // Dia seguinte, ainda dentro da janela do dia 7.
  await db()`update organization set created_at = created_at - interval '1 day'
             where id = 'trial-semana'`;
  const amanha = caixaDeCorreio();
  await sendTrialEmails({ send: amanha.send });
  assert.equal(
    amanha.enviados.filter((e) => e.to === "semana@exemplo-de-teste.pt").length,
    0,
    "o trial_email_log segura-o",
  );
});

test("P13: um envio que falha não fica dado como enviado", { skip }, async () => {
  await novoStand("trial-falha", "falha@exemplo-de-teste.pt", 0);
  const { sendTrialEmails } = await import("../../scripts/pipeline/trial-emails");

  const r = await sendTrialEmails({
    send: async () => {
      throw new Error("Resend em baixo");
    },
  });
  assert.equal(r.failed, 1);

  const { enviados, send } = caixaDeCorreio();
  await sendTrialEmails({ send });
  assert.deepEqual(
    enviados.map((e) => e.to),
    ["falha@exemplo-de-teste.pt"],
    "a corrida seguinte tenta outra vez",
  );
});
