/**
 * Convites da equipa do stand — o que cumpre o "um preço só, toda a equipa do
 * stand incluída" que a landing e /legal/subscricao vendem.
 *
 * As **mutações** passam todas pelo plugin `organization()` do Better Auth
 * (`auth.api.*`). Não é preguiça: é ele que já recusa o convite expirado, o
 * convite já usado/cancelado e — a parte que interessa — o convite para o email
 * A aceite por quem tem sessão como B (compara `invitation.email` com
 * `session.user.email`). Reescrever isso à mão era reescrever exatamente a
 * parte perigosa. A **leitura** da lista é Drizzle direto: não precisa de
 * permissões que o `/stand` não tenha já resolvido, e a rota do plugin exigia
 * `activeOrganizationId` na sessão, que nem sempre lá está.
 *
 * ⚠️ As funções recebem os `headers` (e o id do stand) em vez de os irem
 * buscar à sessão: quem resolve a sessão é o `lib/data.ts`. Assim isto é
 * testável fora de um pedido do Next — ver tests/queries/invites.test.ts.
 */
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { invitation, organization } from "../db/schema";
import { auth } from "./auth";
import { standRoleQuery } from "./queries";
import type { InviteView, PendingInvite } from "./types";

export type InviteResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.string().trim().toLowerCase().email().max(255);

/** Código de erro do Better Auth, quando o erro veio de lá. */
function codeOf(error: unknown): string | undefined {
  const body = (error as { body?: { code?: string } } | null)?.body;
  return typeof body?.code === "string" ? body.code : undefined;
}

/** Convites por aceitar (pendentes e ainda dentro da validade) do stand. */
export async function pendingInvites(standId: string): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, standId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, sql`now()`),
      ),
    )
    .orderBy(asc(invitation.createdAt));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}

/**
 * Convida alguém para o stand, como `member`.
 *
 * O papel é fixo: não há hoje um segundo papel útil, e um seletor que só tem
 * uma opção é uma pergunta a fingir. Sem limite de lugares — o preço é por
 * stand, é isso que a landing diz.
 *
 * A verificação de dono é feita aqui **e** pelo plugin (que compara o papel do
 * membro com a permissão `invitation: ["create"]`). A daqui existe pela
 * mensagem: o plugin devolve inglês, e o utilizador merece saber porquê.
 */
export async function createInvite(
  headers: Headers,
  standId: string,
  rawEmail: string,
): Promise<InviteResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "Escreve um email válido." };
  const email = parsed.data;

  const session = await auth.api.getSession({ headers });
  if (!session?.user) return { ok: false, error: "Sessão inválida. Entra outra vez." };

  const role = await standRoleQuery(standId, session.user.id);
  if (role !== "owner") return { ok: false, error: "Só o dono do stand pode convidar." };

  if (email === session.user.email.toLowerCase()) {
    return { ok: false, error: "Já fazes parte deste stand." };
  }

  try {
    await auth.api.createInvitation({
      headers,
      body: { email, role: "member", organizationId: standId },
    });
    return { ok: true };
  } catch (error) {
    switch (codeOf(error)) {
      case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
        return { ok: false, error: "Esta pessoa já faz parte do stand." };
      case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
        return { ok: false, error: "Já existe um convite por aceitar para este email." };
      case "INVALID_EMAIL":
        return { ok: false, error: "Escreve um email válido." };
      case "INVITATION_LIMIT_REACHED":
        return { ok: false, error: "Há convites por aceitar a mais. Cancela alguns primeiro." };
      default:
        // Nunca devolver o erro cru ao cliente (ver CLAUDE.md).
        console.error("[convites] falha ao convidar:", error);
        return { ok: false, error: "Não foi possível enviar o convite. Tenta outra vez." };
    }
  }
}

/** Cancela um convite por aceitar. Só o dono, e só do próprio stand. */
export async function cancelInvite(
  headers: Headers,
  standId: string,
  invitationId: string,
): Promise<InviteResult> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return { ok: false, error: "Sessão inválida. Entra outra vez." };

  const role = await standRoleQuery(standId, session.user.id);
  if (role !== "owner") return { ok: false, error: "Só o dono do stand pode cancelar convites." };

  // O id do convite é a única coisa que vem do cliente: confirmamos que é
  // mesmo deste stand antes de mexer nele.
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, standId)))
    .limit(1);
  if (!row) return { ok: false, error: "Convite não encontrado." };

  try {
    await auth.api.cancelInvitation({ headers, body: { invitationId } });
    return { ok: true };
  } catch (error) {
    console.error("[convites] falha ao cancelar:", error);
    return { ok: false, error: "Não foi possível cancelar o convite. Tenta outra vez." };
  }
}

/**
 * Aceita o convite com a sessão que existir nos `headers`.
 *
 * Quem impede que o convite para A seja aceite por B é o plugin, dentro desta
 * chamada. Aqui só traduzimos o "não" para português.
 */
export async function acceptInvite(headers: Headers, invitationId: string): Promise<InviteResult> {
  try {
    await auth.api.acceptInvitation({ headers, body: { invitationId } });
    return { ok: true };
  } catch (error) {
    switch (codeOf(error)) {
      case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
        return { ok: false, error: "Este convite é para outro email." };
      case "INVITATION_NOT_FOUND":
        return { ok: false, error: "Este convite já não é válido." };
      case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
        return { ok: false, error: "Já fazes parte deste stand." };
      default:
        console.error("[convites] falha ao aceitar:", error);
        return { ok: false, error: "Não foi possível aceitar o convite. Tenta outra vez." };
    }
  }
}

/**
 * O que a página do convite mostra, **sem sessão** — quem é convidado pode
 * ainda não ter conta, e tem de perceber para onde foi convidado antes de a
 * criar. O `id` do convite é um token opaco gerado pelo Better Auth (é ele o
 * segredo, como no link de reset de password); sem ele não se lê nada.
 */
export async function readInvite(id: string): Promise<InviteView> {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      standName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, id))
    .limit(1);

  if (!row) return { status: "inexistente" };
  if (row.status === "accepted") return { status: "aceite" };
  if (row.status !== "pending") return { status: "cancelado" };
  if (row.expiresAt.getTime() <= Date.now()) return { status: "expirado" };

  return { status: "pendente", id: row.id, email: row.email, standName: row.standName };
}
