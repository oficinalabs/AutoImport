import { DemoBanner } from "@/components/demo-banner";
import { TopBar } from "@/components/top-bar";
import type { Metadata } from "next";

// A app fica fora dos motores de busca até haver autenticação real.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Toda a área autenticada depende da sessão (e da BD quando existe):
// renderizar por pedido, nunca pré-renderar no build.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Sem DATABASE_URL a app corre sobre dados mock — o banner avisa disso.
  const isDemo = !process.env.DATABASE_URL;
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      {isDemo && <DemoBanner />}
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
