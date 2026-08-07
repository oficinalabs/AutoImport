import { TopBar } from "@/components/top-bar";
import { auth } from "@/lib/auth";
import { getDataFreshness, getNotifications, getStand } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { SubscriptionStatus } from "@/lib/types";
import type { Metadata } from "next";
import { headers } from "next/headers";

// A app fica fora dos motores de busca até haver autenticação real.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Toda a área autenticada depende da sessão (e da BD quando existe):
// renderizar por pedido, nunca pré-renderar no build.
export const dynamic = "force-dynamic";

/**
 * Etiqueta da barra de topo, por estado. Cada uma diz a verdade sobre a data
 * que a acompanha: "renova" só quando renova mesmo — quem cancelou tem acesso
 * até lá e mais nada, e dizer-lhe "renova" era prometer uma cobrança que não
 * vai acontecer.
 *
 * O gate está em components/subscription-gate.tsx, montado pelo layout do grupo
 * `(gated)` — ver lá porque é que não pode viver neste layout (que envolve
 * também o /stand, o destino do redirect).
 */
const ETIQUETA: Record<SubscriptionStatus, (data: string) => string> = {
  trial: (data) => `Trial · termina ${data}`,
  ativa: (data) => `Ativa · renova ${data}`,
  cancelada: (data) => `Cancelada · acesso até ${data}`,
  em_atraso: (data) => `Pagamento em atraso · acesso até ${data}`,
  expirada: () => "Subscrição expirada",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [stand, notifications, session, lastSeenAt] = await Promise.all([
    getStand(),
    getNotifications(),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
    getDataFreshness(),
  ]);

  const sub = stand?.subscription;
  const subscriptionLabel = sub ? ETIQUETA[sub.status](formatDate(sub.renewsAt)) : "";

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        standName={stand?.name ?? "O meu stand"}
        userName={session?.user?.name ?? stand?.members[0]?.name ?? "Conta"}
        subscriptionLabel={subscriptionLabel}
        notifications={notifications}
        lastSeenAt={lastSeenAt}
      />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
