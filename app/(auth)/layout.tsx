import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-[1120px] px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          <span className="font-medium">Auto</span>Import
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="pb-6 text-center text-xs text-ink-soft">© 2026 AutoImport</footer>
    </div>
  );
}
