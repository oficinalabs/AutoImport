import { Wordmark } from "@/components/wordmark";
import { DOCUMENTOS, EMPRESA, EMPRESA_POR_PREENCHER } from "@/lib/legal";
import Link from "next/link";

/**
 * Rodapé público. A identificação da entidade (denominação, NIPC, sede) é
 * obrigatória por lei em qualquer site que preste serviços online — DL 7/2004,
 * sem isenção para B2B. Enquanto não estiver preenchida em lib/legal.ts, o
 * rodapé não a inventa: mostra o que há e o resto fica de fora.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-2 text-sm text-ink-soft">
              Que carros compensa importar da Europa, com o custo final real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:gap-12">
            <div>
              <p className="font-semibold">Produto</p>
              <ul className="mt-2 space-y-1.5 text-ink-soft">
                <li>
                  <Link href="/#como-funciona" className="hover:text-ink">
                    Como funciona
                  </Link>
                </li>
                <li>
                  <Link href="/#preco" className="hover:text-ink">
                    Preço
                  </Link>
                </li>
                <li>
                  <Link href="/ajuda" className="hover:text-ink">
                    Perguntas frequentes
                  </Link>
                </li>
                <li>
                  <a href={`mailto:${EMPRESA.emailGeral}`} className="hover:text-ink">
                    Contacto
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-semibold">Legal</p>
              <ul className="mt-2 space-y-1.5 text-ink-soft">
                {DOCUMENTOS.map((d) => (
                  <li key={d.slug}>
                    <Link href={`/legal/${d.slug}`} className="hover:text-ink">
                      {d.titulo}
                    </Link>
                  </li>
                ))}
                <li>
                  <a
                    href="https://www.livroreclamacoes.pt/inicio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-ink"
                  >
                    Livro de Reclamações
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-1 border-t border-line pt-6 text-xs text-ink-soft">
          <span>© 2026 AutoImport · oficinalabs</span>
          {!EMPRESA_POR_PREENCHER && (
            <span>
              {EMPRESA.denominacao} · NIPC {EMPRESA.nipc} · {EMPRESA.sede}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
