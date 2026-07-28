import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import Link from "next/link";

/**
 * Cabeçalho público — landing, páginas legais e ajuda.
 *
 * A navegação é a do desenho escolhido (Vanguard): Mercado · Como funciona ·
 * Preço. A "Ajuda" saiu daqui para o rodapé — três itens deixam o cabeçalho
 * respirar, e quem procura ajuda procura-a em baixo.
 *
 * `data-site-header`: a landing tem hero escuro e o globals.css precisa de
 * escurecer ESTE cabeçalho. Sem o atributo o seletor teria de ser `header`
 * genérico — e apanhava também o <header> do bloco de custos, que ficava com
 * uma barra preta no meio da secção. Aconteceu; daí o atributo.
 */
export function SiteHeader() {
  return (
    <header
      data-site-header
      className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur"
    >
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="AutoImport — início">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-7 text-[11px] uppercase tracking-[0.16em] text-ink-soft sm:flex">
          <Link href="/#mercado" className="transition-colors hover:text-ink">
            Mercado
          </Link>
          <Link href="/#como-funciona" className="transition-colors hover:text-ink">
            Como funciona
          </Link>
          <Link href="/#preco" className="transition-colors hover:text-ink">
            Preço
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
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
