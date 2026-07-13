import { DemoBanner } from "@/components/demo-banner";
import { TopBar } from "@/components/top-bar";
import type { Metadata } from "next";

// A app fica fora dos motores de busca até haver autenticação real.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <DemoBanner />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
