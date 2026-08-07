/**
 * Convites da equipa do stand, ponta a ponta contra uma base descartável:
 * criar, listar, cancelar e aceitar (lib/invites.ts + o plugin organization()
 * do Better Auth).
 *
 * O que isto protege, por ordem de gravidade:
 *   1. **um convite para o email A não pode ser aceite por uma sessão de B** —
 *      é a única parte disto que, se falhar, deixa entrar no stand de outra
 *      pessoa. Testada por dentro (lib/invites.ts) e o resultado confirmado na
 *      base, não só no valor devolvido;
 *   2. só o **dono** convida — e não basta a UI esconder o botão, por isso o
 *      teste chama a função do servidor com a sessão de um colaborador;
 *   3. convites **cancelados** e **expirados** dizem que não, em vez de
 *      rebentarem ou (pior) deixarem passar;
 *   4. quem se regista a partir de um convite **não** fica dono de um stand
 *      fantasma (o databaseHook em lib/auth.ts).
 *
 * ⚠️ `process.env.WAREHOUSE_URL` tem de ser definido ANTES de qualquer
 * `await import("../../db")`: o db/index.ts congela a connection string no
 * import. Por isso os módulos são importados dentro dos testes.
 *
 * ⚠️ EMAILS: o convite manda um email. A `RESEND_API_KEY` é APAGADA do
 * ambiente antes de qualquer import — sem chave o lib/email.ts não envia nada.
 * Este teste nunca pode falar com o mundo.
 */
import assert from "node:assert/strict";
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

// Antes de tudo o resto: o lib/email.ts lê a chave no import do módulo.
process.env.RESEND_API_KEY = "";
// biome-ignore lint/performance/noDelete: tem de sair do ambiente, não ficar vazia
delete process.env.RESEND_API_KEY;
// Sem isto o Better Auth avisa a cada import e assina cookies com um default.
process.env.BETTER_AUTH_SECRET ||= "segredo-so-para-os-testes-dos-convites";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";

const DB_URL = dbUrl();
const skip = skipUnlessLocalDb("o teste dos convites");
const TEST_DB = "autoimport_invites_test";

const PASSWORD = "Convite!Forte9";
const DONO = "dono@exemplo-de-teste.pt";
const COLEGA = "Colega@Exemplo-de-Teste.pt"; // maiúsculas de propósito
const TERCEIRO = "terceiro@exemplo-de-teste.pt";
const ATRASADO = "atrasado@exemplo-de-teste.pt";

let sql: ReturnType<typeof postgres>;
/** Módulos da app, importados depois da WAREHOUSE_URL estar definida. */
let app: {
  auth: typeof import("../../lib/auth").auth;
  invites: typeof import("../../lib/invites");
  queries: typeof import("../../lib/queries");
  closeDb: typeof import("../../db").closeDb;
};

let orgId: string;
let donoHeaders: Headers;
let colegaHeaders: Headers;

/** Cria a conta, marca o email como verificado e devolve os headers com sessão. */
async function contaComSessao(email: string, name: string, standName?: string): Promise<Headers> {
  await app.auth.api.signUpEmail({
    body: { name, email, password: PASSWORD, ...(standName ? { standName } : {}) } as never,
  });
  // A app exige email verificado para entrar (docs/03); no teste não há caixa
  // de correio, portanto marca-se à mão.
  await sql`update "user" set email_verified = true where lower(email) = ${email.toLowerCase()}`;

  const response = await app.auth.api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  });
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookies, `sem cookie de sessão para ${email}`);
  return new Headers({ cookie: cookies });
}

async function userId(email: string): Promise<string> {
  const [row] = await sql`select id from "user" where lower(email) = ${email.toLowerCase()}`;
  return row.id as string;
}

before(async () => {
  if (skip) return;
  await recreateDatabases(DB_URL, TEST_DB);
  const url = withDbName(DB_URL, TEST_DB);
  migrate(url);

  process.env.WAREHOUSE_URL = url;
  process.env.DATABASE_URL = url;
  sql = postgres(url, { prepare: false, onnotice: () => {} });

  app = {
    auth: (await import("../../lib/auth")).auth,
    invites: await import("../../lib/invites"),
    queries: await import("../../lib/queries"),
    closeDb: (await import("../../db")).closeDb,
  };

  donoHeaders = await contaComSessao(DONO, "Rui Costa", "Stand dos Convites");
  const [org] = await sql`select id from organization limit 1`;
  orgId = org.id as string;
});

after(async () => {
  if (skip) return;
  await app?.closeDb();
  await sql?.end();
  await dropDatabases(DB_URL, TEST_DB);
});

test("o dono cria um convite e ele aparece na lista de pendentes", { skip }, async () => {
  const result = await app.invites.createInvite(donoHeaders, orgId, COLEGA);
  assert.deepEqual(result, { ok: true });

  const pendentes = await app.invites.pendingInvites(orgId);
  assert.equal(pendentes.length, 1);
  // Normalizado para minúsculas — senão o convite nunca casaria com a conta.
  assert.equal(pendentes[0].email, COLEGA.toLowerCase());
});

test("convidar o mesmo email outra vez não duplica o convite", { skip }, async () => {
  const result = await app.invites.createInvite(donoHeaders, orgId, COLEGA);
  assert.equal(result.ok, false);
  assert.equal((await app.invites.pendingInvites(orgId)).length, 1);
});

test("quem se regista a partir de um convite não fica dono de um stand", { skip }, async () => {
  colegaHeaders = await contaComSessao(COLEGA, "Ana Silva");

  const orgs = await sql`
    select o.id from organization o
      join member m on m.organization_id = o.id
     where m.user_id = ${await userId(COLEGA)}`;
  assert.equal(orgs.length, 0, "o convidado não pode nascer dono de um stand fantasma");
});

test(
  "aceitar o convite dá 'member' no stand certo, e o stand passa a ter dois",
  { skip },
  async () => {
    const [convite] = await app.invites.pendingInvites(orgId);
    const result = await app.invites.acceptInvite(colegaHeaders, convite.id);
    assert.deepEqual(result, { ok: true });

    assert.equal(await app.queries.standRoleQuery(orgId, await userId(COLEGA)), "member");

    const stand = await app.queries.getStandQuery(orgId);
    assert.equal(stand?.members.length, 2);
    assert.deepEqual(
      stand?.members.map((m) => m.role).sort(),
      ["member", "owner"],
      "um dono e um colaborador",
    );

    // O convite deixa de estar pendente.
    assert.equal((await app.invites.pendingInvites(orgId)).length, 0);
  },
);

test("um membro que não é dono não consegue convidar", { skip }, async () => {
  const result = await app.invites.createInvite(
    colegaHeaders,
    orgId,
    "intruso@exemplo-de-teste.pt",
  );
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /dono/i);

  const [{ count }] = await sql`select count(*)::int from invitation`;
  assert.equal(count, 1, "não pode ter sido criado convite nenhum");

  // E não é só a nossa verificação: o próprio plugin recusa quem lá chegue por
  // baixo dela. Se um dia trocarmos a mensagem, a porta continua fechada.
  await assert.rejects(
    app.auth.api.createInvitation({
      headers: colegaHeaders,
      body: { email: "intruso@exemplo-de-teste.pt", role: "member", organizationId: orgId },
    }),
  );
});

test("um convite para o email A não pode ser aceite por uma sessão de B", { skip }, async () => {
  assert.deepEqual(await app.invites.createInvite(donoHeaders, orgId, TERCEIRO), { ok: true });
  const [convite] = await app.invites.pendingInvites(orgId);

  // A Ana (colega) tem o link do convite do terceiro e tenta usá-lo.
  const result = await app.invites.acceptInvite(colegaHeaders, convite.id);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /outro email/i);

  // O que interessa não é a mensagem: é a base não ter mudado.
  const [row] = await sql`select status from invitation where id = ${convite.id}`;
  assert.equal(row.status, "pending");
  const stand = await app.queries.getStandQuery(orgId);
  assert.equal(stand?.members.length, 2, "ninguém entrou no stand");
});

test("um convite cancelado não pode ser aceite", { skip }, async () => {
  const [convite] = await app.invites.pendingInvites(orgId);
  assert.deepEqual(await app.invites.cancelInvite(donoHeaders, orgId, convite.id), { ok: true });
  assert.equal((await app.invites.pendingInvites(orgId)).length, 0);
  assert.deepEqual(await app.invites.readInvite(convite.id), { status: "cancelado" });

  const terceiroHeaders = await contaComSessao(TERCEIRO, "Zé Terceiro", "Stand do Terceiro");
  const result = await app.invites.acceptInvite(terceiroHeaders, convite.id);
  assert.equal(result.ok, false);

  assert.equal((await app.queries.getStandQuery(orgId))?.members.length, 2);
});

test("um convite expirado não pode ser aceite", { skip }, async () => {
  assert.deepEqual(await app.invites.createInvite(donoHeaders, orgId, ATRASADO), { ok: true });
  const [convite] = await app.invites.pendingInvites(orgId);
  const atrasadoHeaders = await contaComSessao(ATRASADO, "Tó Atrasado");

  await sql`update invitation set expires_at = now() - interval '1 day' where id = ${convite.id}`;

  // Um convite fora da validade some da lista e diz porquê — não rebenta.
  assert.equal((await app.invites.pendingInvites(orgId)).length, 0);
  assert.deepEqual(await app.invites.readInvite(convite.id), { status: "expirado" });

  const result = await app.invites.acceptInvite(atrasadoHeaders, convite.id);
  assert.equal(result.ok, false);
  assert.equal((await app.queries.getStandQuery(orgId))?.members.length, 2);
});

test(
  "o convite pendente é legível sem sessão (a página do convite não tem)",
  { skip },
  async () => {
    assert.deepEqual(
      await app.invites.createInvite(donoHeaders, orgId, "novo@exemplo-de-teste.pt"),
      {
        ok: true,
      },
    );
    const [convite] = await app.invites.pendingInvites(orgId);

    const vista = await app.invites.readInvite(convite.id);
    assert.equal(vista.status, "pendente");
    assert.equal(vista.status === "pendente" && vista.email, "novo@exemplo-de-teste.pt");
    assert.equal(vista.status === "pendente" && vista.standName, "Stand dos Convites");

    // Um id que não existe não rebenta a página.
    assert.deepEqual(await app.invites.readInvite("nao-existe"), { status: "inexistente" });
  },
);
