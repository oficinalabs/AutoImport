import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import Link from "next/link";

/** Cabeçalho público — landing, páginas legais e ajuda. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="AutoImport — início">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-ink-soft sm:flex">
          <Link href="/#como-funciona" className="hover:text-ink">
            Como funciona
          </Link>
          <Link href="/#preco" className="hover:text-ink">
            Preço
          </Link>
          <Link href="/ajuda" className="hover:text-ink">
            Ajuda
          </Link>
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
  );
}
