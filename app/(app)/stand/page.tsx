import { AccountForm } from "@/components/account-form";
import { StandForm } from "@/components/stand-form";
import { TeamCard } from "@/components/team-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPendingInvites, getSessionUser, getStand, getStandRole } from "@/lib/data";
import { formatDate, formatEuroCents } from "@/lib/format";
import type { SubscriptionStatus } from "@/lib/types";

/**
 * Etiqueta e frase da data, por estado. A frase acompanha a etiqueta porque a
 * mesma data quer dizer coisas diferentes: no trial é quando acaba o mês
 * grátis, numa subscrição ativa é a próxima cobrança, e numa cancelada é o fim
 * do acesso — não uma renovação.
 *
 * /stand é a única rota da app **fora** do gate da subscrição
 * (components/subscription-gate.tsx): é aqui que se aterra com o acesso
 * expirado, portanto todos os cinco estados têm de estar cobertos.
 */
const SUB_LABEL: Record<SubscriptionStatus, { label: string; className: string; frase: string }> = {
  trial: {
    label: "Trial (1.º mês grátis)",
    className: "bg-good-soft text-good",
    frase: "Trial termina a",
  },
  ativa: { label: "Ativa", className: "bg-good-soft text-good", frase: "Renova a" },
  cancelada: {
    label: "Cancelada",
    className: "bg-amber-soft text-amber-ink",
    frase: "Acesso até",
  },
  em_atraso: {
    label: "Pagamento em atraso",
    className: "bg-amber-soft text-amber-ink",
    frase: "Acesso até",
  },
  expirada: { label: "Expirada", className: "bg-bad-soft text-bad", frase: "Terminou a" },
};

export default async function StandPage() {
  const [stand, role, utilizador, invites] = await Promise.all([
    getStand(),
    getStandRole(),
    getSessionUser(),
    getPendingInvites(),
  ]);

  // Só acontece com sessão inválida (a rota é protegida) — estado honesto.
  if (!stand || !utilizador) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Stand / Perfil</h1>
        <p className="text-sm text-ink-soft">
          Não foi possível carregar os dados do teu stand. Entra outra vez.
        </p>
      </div>
    );
  }

  const sub = SUB_LABEL[stand.subscription.status];
  const isOwner = role === "owner";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Stand / Perfil</h1>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          {/* A tua conta */}
          <Card>
            <CardHeader>
              <CardTitle>A tua conta</CardTitle>
            </CardHeader>
            <CardContent>
              <AccountForm nome={utilizador.name} email={utilizador.email} />
            </CardContent>
          </Card>

          {/* Dados do stand */}
          <Card>
            <CardContent className="pt-6">
              <StandForm stand={stand} canEdit={isOwner} />
            </CardContent>
          </Card>

          {/* Equipa */}
          <TeamCard members={stand.members} invites={invites} isOwner={isOwner} />
        </div>

        {/* Subscrição */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Subscrição</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${sub.className}`}
            >
              {sub.label}
            </span>
            <div>
              <div className="tnum font-display text-3xl font-bold">
                {formatEuroCents(stand.subscription.pricePerMonth)}
                <span className="text-base font-medium text-ink-soft">/mês</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {sub.frase} {formatDate(stand.subscription.renewsAt)}.
              </p>
            </div>
            {stand.subscription.status === "expirada" && (
              <p className="text-sm text-ink-soft">
                O acesso à app está suspenso. Os teus dados, favoritos e alertas ficam guardados —
                voltam assim que a subscrição for reativada.
              </p>
            )}
            {/* Continua desativado: o checkout da Polar precisa do
                POLAR_ACCESS_TOKEN, que ainda não existe. Ligar um botão que dá
                erro é pior do que um botão que diz que ainda não dá. */}
            <Button variant="primary" disabled title="Ainda não disponível">
              Gerir subscrição
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
