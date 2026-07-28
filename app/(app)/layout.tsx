import { TopBar } from "@/components/top-bar";
import { auth } from "@/lib/auth";
import { getNotifications, getStand } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { Metadata } from "next";
import { headers } from "next/headers";

// A app fica fora dos motores de busca até haver autenticação real.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Toda a área autenticada depende da sessão (e da BD quando existe):
// renderizar por pedido, nunca pré-renderar no build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [stand, notifications, session] = await Promise.all([
    getStand(),
    getNotifications(),
    auth.api.getSession({ headers: await headers() }).catch(() => null),
  ]);

  const sub = stand?.subscription;
  const subscriptionLabel = !sub
    ? ""
    : sub.status === "trial"
      ? `Trial · termina ${formatDate(sub.renewsAt)}`
      : sub.status === "ativa"
        ? `Ativa · renova ${formatDate(sub.renewsAt)}`
        : "Subscrição expirada";

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        standName={stand?.name ?? "O meu stand"}
        userName={session?.user?.name ?? stand?.members[0]?.name ?? "Conta"}
        subscriptionLabel={subscriptionLabel}
        notifications={notifications}
      />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
