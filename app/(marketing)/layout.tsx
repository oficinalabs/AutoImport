import { Button } from "@/components/ui/button";
import Link from "next/link";

function Wordmark() {
  return (
    <span className="font-display text-lg font-bold tracking-tight">
      <span className="font-medium">Auto</span>Import
    </span>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="AutoImport — início">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-ink-soft sm:flex">
            <a href="#como-funciona" className="hover:text-ink">
              Como funciona
            </a>
            <a href="#preco" className="hover:text-ink">
              Preço
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/entrar">Entrar</Link>
            </Button>
            <Button asChild variant="accent" size="sm">
              <Link href="/registar">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-soft sm:px-6">
          <Wordmark />
          <nav className="flex items-center gap-4">
            <Link href="/entrar" className="hover:text-ink">
              Entrar
            </Link>
            <Link href="/registar" className="hover:text-ink">
              Criar conta
            </Link>
            <a href="mailto:ola@autoimport.arestadigital.pt" className="hover:text-ink">
              Contacto
            </a>
          </nav>
          <span className="text-xs">© 2026 AutoImport · oficinalabs</span>
        </div>
      </footer>
    </div>
  );
}
