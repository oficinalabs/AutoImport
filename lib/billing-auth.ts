/**
 * Quem pode mexer na subscrição: o **dono** do stand da sessão. Partilhado
 * pelas rotas de checkout e de portal (app/api/polar/…), que não podem exportar
 * mais nada além dos handlers.
 *
 * Mesma resolução do stand que o `activeStandId` de lib/data.ts (organização
 * ativa da sessão, senão a primeira): o standId nunca vem do cliente. Esconder
 * os botões a quem não é dono é só conveniência — quem manda é isto.
 */
import { auth } from "./auth";
import { standRoleQuery } from "./queries";

export type DonoDoStand =
  | { ok: true; standId: string; email: string }
  | { ok: false; status: 401 | 403 };

export async function donoDoStand(headers: Headers): Promise<DonoDoStand> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return { ok: false, status: 401 };

  let standId = session.session.activeOrganizationId ?? null;
  if (!standId) {
    const orgs = await auth.api.listOrganizations({ headers });
    standId = orgs[0]?.id ?? null;
  }
  if (!standId) return { ok: false, status: 403 };

  const papel = await standRoleQuery(standId, session.user.id);
  if (papel !== "owner") return { ok: false, status: 403 };
  return { ok: true, standId, email: session.user.email };
}
