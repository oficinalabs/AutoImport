/**
 * Estado da subscrição: o webhook da Polar que o escreve
 * (app/api/polar/webhook/route.ts) e a query que o lê (getStandQuery).
 *
 * O que isto NÃO prova, e é importante dizê-lo: a assinatura é gerada aqui pela
 * mesma construção que o verificador usa (HMAC-SHA256 sobre
 * `id.timestamp.corpo`, em base64), portanto a parte de "assinatura boa passa"
 * é em boa medida uma tautologia. **A interoperabilidade com a Polar a sério
 * continua por confirmar** — só uma entrega da sandbox deles a prova, e não há
 * credenciais neste ambiente.
 *
 * O que os testes provam mesmo são erros de lógica, que é onde estes bugs
 * moram: corpo adulterado rejeitado, janela de tempo imposta nos dois sentidos,
 * assinatura sobre o conteúdo errado rejeitada (o engano clássico é assinar só
 * o corpo), lista de assinaturas percorrida até ao fim, e — o que interessa ao
 * produto — ambiente sem segredo não escreve nada.
 *
 * ⚠️ `process.env.WAREHOUSE_URL` tem de ser definido ANTES de qualquer
 * `await import` do `db/`: o db/index.ts congela a connection string no import.
 * Por isso os módulos são importados dentro dos testes.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
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

const DB_URL = dbUrl();
const skip = skipUnlessLocalDb("o teste da subscrição");
const TEST_DB = "autoimport_subscription_test";

const SEGREDO = "segredo-de-teste-nao-e-o-da-polar";
const DIA = 24 * 60 * 60 * 1000;

/** Um stand por cenário — os testes não podem sujar-se uns aos outros. */
const STAND_NOVO = "stand-novo-no-trial";
const STAND_VELHO = "stand-com-trial-acabado";
const STAND_PAGO = "stand-que-paga";

let sql: ReturnType<typeof postgres> | null = null;

before(async () => {
  if (skip) return;
  await recreateDatabases(DB_URL as string, TEST_DB);
  const url = withDbName(DB_URL as string, TEST_DB);
  migrate(url);
  process.env.WAREHOUSE_URL = url;
  sql = postgres(url, { prepare: false, onnotice: () => {} });

  for (const [id, diasAtras] of [
    [STAND_NOVO, 5],
    [STAND_VELHO, 100],
    [STAND_PAGO, 200],
  ] as const) {
    await sql`insert into organization (id, name, slug, created_at)
              values (${id}, ${id}, ${id}, ${new Date(Date.now() - diasAtras * DIA)})`;
  }
});

after(async () => {
  if (skip) return;
  await sql?.end();
  const { closeDb } = await import("../../db");
  await closeDb();
  await dropDatabases(DB_URL as string, TEST_DB);
});

// ── Webhook ──────────────────────────────────────────────────────

/**
 * Constrói os headers do Standard Webhooks. Deliberadamente escrito à mão (e
 * não a chamar código de produção) para que uma mudança no formato do
 * verificador parta este teste em vez de o acompanhar em silêncio.
 */
function headersAssinados(corpo: string, opcoes: { segundos?: number; segredo?: string } = {}) {
  const id = "msg_teste_0001";
  const segundos = opcoes.segundos ?? Math.floor(Date.now() / 1000);
  const assinatura = createHmac("sha256", Buffer.from(opcoes.segredo ?? SEGREDO, "utf-8"))
    .update(`${id}.${segundos}.${corpo}`)
    .digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(segundos),
    "webhook-signature": `v1,${assinatura}`,
    "content-type": "application/json",
  };
}

function eventoDeSubscricao(over: Record<string, unknown> = {}, tipo = "subscription.updated") {
  return JSON.stringify({
    type: tipo,
    data: {
      id: "sub_polar_001",
      status: "active",
      current_period_end: new Date(Date.now() + 30 * DIA).toISOString(),
      cancel_at_period_end: false,
      customer_id: "cus_polar_001",
      metadata: { stand_id: STAND_PAGO },
      ...over,
    },
  });
}

/** Entrega um corpo ao handler, com os headers indicados. */
async function entregar(corpo: string, headers: Record<string, string>) {
  const { POST } = await import("../../app/api/polar/webhook/route");
  return POST(
    new Request("http://localhost:3000/api/polar/webhook", {
      method: "POST",
      body: corpo,
      headers,
    }),
  );
}

/** A linha de subscrição do stand, ou null. */
async function linha(standId: string) {
  const rows = await (sql as ReturnType<typeof postgres>)`
    select status, current_period_end, cancel_at_period_end, polar_subscription_id, polar_customer_id
    from subscriptions where stand_id = ${standId}`;
  return rows[0] ?? null;
}

test("sem POLAR_WEBHOOK_SECRET: 503 e não escreve nada", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = "";
  const corpo = eventoDeSubscricao();
  // Headers válidos de propósito: o que trava não é a assinatura, é a ausência
  // de segredo. Um endpoint sem verificação é um sítio onde qualquer pessoa se
  // põe com subscrição ativa.
  const res = await entregar(corpo, headersAssinados(corpo));
  assert.equal(res.status, 503);
  assert.equal(await linha(STAND_PAGO), null, "não pode ter escrito nada");
});

test("assinatura válida: 200 e a linha passa a existir", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const fimDoPeriodo = new Date(Date.now() + 30 * DIA).toISOString();
  const corpo = eventoDeSubscricao({ current_period_end: fimDoPeriodo });
  const res = await entregar(corpo, headersAssinados(corpo));
  assert.equal(res.status, 200);

  const row = await linha(STAND_PAGO);
  assert.equal(row?.status, "ativa");
  assert.equal(row?.polar_subscription_id, "sub_polar_001");
  assert.equal(row?.polar_customer_id, "cus_polar_001");
  assert.equal(row?.cancel_at_period_end, false);

  // A data tem de sobreviver à ida e volta sem escorregar uma hora. A coluna é
  // `timestamp` sem fuso — é o sítio clássico onde o horário de verão faz uma
  // subscrição expirar 60 minutos antes ou depois do que devia.
  const { getStandQuery } = await import("../../lib/queries");
  const stand = await getStandQuery(STAND_PAGO);
  assert.equal(stand?.subscription.renewsAt, fimDoPeriodo, "o que a Polar mandou é o que se lê");
});

test("corpo adulterado depois de assinado: 401 e a linha não muda", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const antes = await linha(STAND_PAGO);

  const original = eventoDeSubscricao();
  const headers = headersAssinados(original);
  // O ataque óbvio: assina-se um evento inócuo e entrega-se outro.
  const adulterado = eventoDeSubscricao({ status: "active" }, "subscription.revoked");
  const res = await entregar(adulterado, headers);

  assert.equal(res.status, 401);
  assert.deepEqual(await linha(STAND_PAGO), antes, "nada pode ter mudado");
});

test("assinatura sobre o conteúdo errado: 401", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const corpo = eventoDeSubscricao();
  // Assinar só o corpo (sem `id.timestamp.`) é o engano clássico de quem
  // implementa isto de cabeça. Tem de ser recusado.
  const headers = {
    ...headersAssinados(corpo),
    "webhook-signature": `v1,${createHmac("sha256", Buffer.from(SEGREDO, "utf-8")).update(corpo).digest("base64")}`,
  };
  assert.equal((await entregar(corpo, headers)).status, 401);
});

test("segredo errado: 401", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const corpo = eventoDeSubscricao();
  assert.equal((await entregar(corpo, headersAssinados(corpo, { segredo: "outro" }))).status, 401);
});

test("timestamp fora da janela: 401 nos dois sentidos", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const corpo = eventoDeSubscricao();
  const agora = Math.floor(Date.now() / 1000);

  // Replay de um pedido antigo — a assinatura continua a bater, é do mesmo
  // corpo; o que o trava é a janela.
  const velho = headersAssinados(corpo, { segundos: agora - 10 * 60 });
  assert.equal((await entregar(corpo, velho)).status, 401);

  // E do futuro, senão bastava mentir no relógio para o replay durar sempre.
  const futuro = headersAssinados(corpo, { segundos: agora + 10 * 60 });
  assert.equal((await entregar(corpo, futuro)).status, 401);

  // Dentro da janela (4 min) continua a passar — a guarda não pode ser tão
  // apertada que rejeite entregas normais com atraso de rede.
  const recente = headersAssinados(corpo, { segundos: agora - 4 * 60 });
  assert.equal((await entregar(corpo, recente)).status, 200);
});

test("headers em falta: 401", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const corpo = eventoDeSubscricao();
  const { "webhook-signature": _, ...semAssinatura } = headersAssinados(corpo);
  assert.equal((await entregar(corpo, semAssinatura)).status, 401);
  assert.equal((await entregar(corpo, {})).status, 401);
});

test("rotação do segredo: várias assinaturas no header, basta uma bater", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const corpo = eventoDeSubscricao();
  const boa = headersAssinados(corpo);
  const má = headersAssinados(corpo, { segredo: "segredo-antigo" });
  const headers = {
    ...boa,
    "webhook-signature": `${má["webhook-signature"]} ${boa["webhook-signature"]}`,
  };
  assert.equal((await entregar(corpo, headers)).status, 200, "a lista tem de ser percorrida toda");
});

test("cancelada e revogada mudam o estado gravado", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;

  // Cancelou, mas o período pago ainda corre: não é "expirada", e a UI não lhe
  // pode dizer "renova".
  const cancelada = eventoDeSubscricao({ cancel_at_period_end: true });
  assert.equal((await entregar(cancelada, headersAssinados(cancelada))).status, 200);
  let row = await linha(STAND_PAGO);
  assert.equal(row?.status, "cancelada");
  assert.equal(row?.cancel_at_period_end, true);

  // `revoked` é "corta já", mesmo com o objeto a dizer `active`.
  const revogada = eventoDeSubscricao({}, "subscription.revoked");
  assert.equal((await entregar(revogada, headersAssinados(revogada))).status, 200);
  row = await linha(STAND_PAGO);
  assert.equal(row?.status, "expirada");

  // Pagamento falhado — conta suspensa, não eliminada (ver /legal/subscricao).
  const atraso = eventoDeSubscricao({ status: "past_due" }, "subscription.past_due");
  assert.equal((await entregar(atraso, headersAssinados(atraso))).status, 200);
  row = await linha(STAND_PAGO);
  assert.equal(row?.status, "em_atraso");

  // Uma linha por stand — os eventos atualizam, não acumulam.
  const todas = await (sql as ReturnType<typeof postgres>)`select count(*) from subscriptions`;
  assert.equal(Number(todas[0].count), 1);
});

test("eventos e payloads que não nos dizem respeito não são erro", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const antes = await linha(STAND_PAGO);

  // 202 e não 4xx: devolver erro fazia a Polar reentregar para sempre.
  const outro = JSON.stringify({ type: "order.paid", data: { id: "ord_1" } });
  assert.equal((await entregar(outro, headersAssinados(outro))).status, 202);

  const semStand = eventoDeSubscricao({ metadata: {}, customer_id: null });
  assert.equal((await entregar(semStand, headersAssinados(semStand))).status, 202);

  const standDesconhecido = eventoDeSubscricao({ metadata: { stand_id: "nao-existe" } });
  assert.equal(
    (await entregar(standDesconhecido, headersAssinados(standDesconhecido))).status,
    202,
  );

  const estadoNovo = eventoDeSubscricao({ status: "algo_que_a_polar_inventou" });
  assert.equal((await entregar(estadoNovo, headersAssinados(estadoNovo))).status, 202);

  assert.deepEqual(await linha(STAND_PAGO), antes, "nenhum deles pode escrever");

  // Corpo que não é o que dizemos aceitar: 400, e o Zod é que decide.
  const lixo = JSON.stringify({ type: "subscription.updated", data: { id: 42 } });
  assert.equal((await entregar(lixo, headersAssinados(lixo))).status, 400);
  const naoJson = "isto não é json";
  assert.equal((await entregar(naoJson, headersAssinados(naoJson))).status, 400);
});

test("o external_id do cliente serve de alternativa ao metadata", { skip }, async () => {
  process.env.POLAR_WEBHOOK_SECRET = SEGREDO;
  const corpo = eventoDeSubscricao({
    id: "sub_polar_002",
    metadata: {},
    customer: { external_id: STAND_NOVO },
  });
  assert.equal((await entregar(corpo, headersAssinados(corpo))).status, 200);
  assert.equal((await linha(STAND_NOVO))?.status, "ativa");

  // Limpar: o STAND_NOVO é do teste do trial derivado, e uma linha aqui
  // mudava-lhe a resposta.
  await (sql as ReturnType<
    typeof postgres
  >)`delete from subscriptions where stand_id = ${STAND_NOVO}`;
});

// ── getStandQuery ────────────────────────────────────────────────

test("sem linha de subscrição: trial derivado do created_at", { skip }, async () => {
  const { getStandQuery } = await import("../../lib/queries");
  const { CONDICOES } = await import("../../lib/legal");

  // O caminho normal de qualquer stand até alguém pagar — e há um stand real
  // na base sem linha nenhuma. Não pode virar "expirada" por falta de dados.
  const novo = await getStandQuery(STAND_NOVO);
  assert.equal(novo?.subscription.status, "trial");
  assert.equal(novo?.subscription.pricePerMonth, CONDICOES.precoMensalEuros);

  const fim = new Date(novo?.subscription.renewsAt as string).getTime();
  const esperado = Date.now() + (CONDICOES.trialDias - 5) * DIA;
  assert.ok(Math.abs(fim - esperado) < DIA, "o trial acaba 30 dias depois do registo");

  // Registado há 100 dias, trial de 30: acabou, e ninguém pagou.
  assert.equal((await getStandQuery(STAND_VELHO))?.subscription.status, "expirada");
});

test("com linha: o estado gravado manda, até o período acabar", { skip }, async () => {
  const { getStandQuery } = await import("../../lib/queries");
  const fim = new Date(Date.now() + 20 * DIA);

  // ⚠️ `.toISOString()` e não o Date: a coluna é `timestamp` sem fuso, e o
  // driver serializa um Date com o offset local (agora +01:00) enquanto o
  // drizzle lê como UTC. O código de produção escreve e lê os dois lados pelo
  // drizzle, portanto é coerente; passar por SQL cru aqui não pode introduzir
  // uma hora de diferença que a app não tem.
  await (sql as ReturnType<typeof postgres>)`
    update subscriptions
    set status = 'ativa', current_period_end = ${fim.toISOString()}, cancel_at_period_end = false
    where stand_id = ${STAND_PAGO}`;

  const pago = await getStandQuery(STAND_PAGO);
  assert.equal(pago?.subscription.status, "ativa");
  assert.equal(
    new Date(pago?.subscription.renewsAt as string).toISOString(),
    fim.toISOString(),
    "a data mostrada é o fim do período, não o fim do trial",
  );

  // O mesmo stand, com o período já passado. Sem isto, uma webhook que nunca
  // chegasse dava acesso de graça para sempre — o estado gravado continuaria
  // 'ativa' e ninguém o corrigia.
  await (sql as ReturnType<typeof postgres>)`
    update subscriptions set current_period_end = ${new Date(Date.now() - DIA).toISOString()}
    where stand_id = ${STAND_PAGO}`;
  assert.equal((await getStandQuery(STAND_PAGO))?.subscription.status, "expirada");
});

test("cancelada com período a correr ainda tem acesso", { skip }, async () => {
  const { getStandQuery } = await import("../../lib/queries");
  const { temAcesso } = await import("../../lib/subscription");

  await (sql as ReturnType<typeof postgres>)`
    update subscriptions
    set status = 'cancelada', current_period_end = ${new Date(Date.now() + 10 * DIA).toISOString()}
    where stand_id = ${STAND_PAGO}`;

  const estado = (await getStandQuery(STAND_PAGO))?.subscription.status;
  assert.equal(estado, "cancelada");
  // Quem cancela a meio do mês pagou o mês. Fechar-lhe a porta era cobrar e não
  // entregar (ver /legal/subscricao).
  assert.equal(temAcesso(estado as "cancelada"), true);
  assert.equal(temAcesso("expirada"), false);
});
