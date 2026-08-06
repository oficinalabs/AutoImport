import { AcceptInvite, SwitchAccount } from "@/components/invite-actions";
import { Button } from "@/components/ui/button";
import { getInvite, getSessionUser } from "@/lib/data";
import { CircleAlert, MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Convite — AutoImport" };

/**
 * Aceitar o convite para a equipa de um stand.
 *
 * ⚠️ **Porque é que esta página vive em `(auth)` e não em `(app)`:** quem é
 * convidado muitas vezes ainda **não tem conta**. `app/(app)/` exige sessão
 * (middleware.ts) e `app/(app)/(gated)/` exige subscrição — um convidado não
 * passa em nenhum dos dois, e seria atirado para /entrar sem nunca ver o
 * convite. O grupo `(auth)` é o único que já é público, e o seu layout já traz
 * `robots: noindex` — que é o que um link com um token deve ter.
 *
 * Os quatro caminhos possíveis:
 *   1. sem sessão      → criar conta (com o email do convite) ou entrar;
 *   2. sessão do email certo → botão de aceitar;
 *   3. sessão de OUTRO email → recusa explícita + sair da sessão. É aqui que
 *      está a segurança visível; a real está no servidor, onde o Better Auth
 *      compara `invitation.email` com `session.user.email` (lib/invites.ts);
 *   4. convite expirado / cancelado / já aceite → diz-se o que aconteceu.
 */
export default async function ConvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invite, utilizador] = await Promise.all([getInvite(id), getSessionUser()]);

  if (invite.status !== "pendente") {
    return (
      <Card>
        <Titulo icon="alerta">Convite indisponível</Titulo>
        <p className="mt-2 text-sm text-ink-soft">{MOTIVO[invite.status]}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/entrar">Ir para o início de sessão</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const mesmoEmail = utilizador?.email.toLowerCase() === invite.email.toLowerCase();

  return (
    <Card>
      <Titulo icon="convite">Convite para o {invite.standName}</Titulo>
      <p className="mt-2 text-sm text-ink-soft">
        Foste convidado para a equipa deste stand no AutoImport. O convite é para{" "}
        <strong className="font-medium text-ink">{invite.email}</strong> e entras como colaborador —
        não há nada a pagar, a subscrição é do stand.
      </p>

      {!utilizador && (
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild variant="accent" size="lg">
            <Link href={`/registar?convite=${encodeURIComponent(invite.id)}`}>
              Criar conta e entrar na equipa
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/entrar?next=${encodeURIComponent(`/convite/${invite.id}`)}`}>
              Já tenho conta
            </Link>
          </Button>
        </div>
      )}

      {utilizador && mesmoEmail && <AcceptInvite id={invite.id} />}

      {utilizador && !mesmoEmail && (
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-[8px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Tens sessão iniciada como <strong>{utilizador.email}</strong>. Este convite só pode
              ser aceite por <strong>{invite.email}</strong>.
            </span>
          </div>
          <SwitchAccount id={invite.id} />
        </div>
      )}
    </Card>
  );
}

const MOTIVO: Record<"expirado" | "cancelado" | "aceite" | "inexistente", string> = {
  expirado: "Este convite expirou. Pede ao dono do stand que te envie um novo.",
  cancelado: "Este convite foi cancelado pelo dono do stand.",
  aceite: "Este convite já foi aceite. Entra na tua conta para chegares ao stand.",
  inexistente: "Este link de convite não corresponde a nenhum convite.",
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[12px] border border-line bg-surface p-6">{children}</div>;
}

function Titulo({ icon, children }: { icon: "convite" | "alerta"; children: React.ReactNode }) {
  const Icon = icon === "convite" ? MailCheck : CircleAlert;
  return (
    <h1 className="flex items-start gap-2 text-xl font-bold">
      <Icon className={`mt-1 size-5 shrink-0 ${icon === "convite" ? "text-good" : "text-warn"}`} />
      <span>{children}</span>
    </h1>
  );
}
