import { formatDate } from "@/lib/format";
import { type DocMeta, EMPRESA, EMPRESA_POR_PREENCHER, vizinhos } from "@/lib/legal";
import { AlertTriangle, ArrowLeft, ArrowRight, Info } from "lucide-react";
import Link from "next/link";

export interface Seccao {
  /** âncora — usada no índice e no link direto */
  id: string;
  titulo: string;
  corpo: React.ReactNode;
}

/**
 * Esqueleto comum aos documentos legais: cabeçalho com data, índice inline,
 * corpo numerado e navegação entre documentos.
 *
 * Índice **inline**, não sidebar: o produto é topbar, e uma coluna lateral fixa
 * aqui introduzia uma segunda navegação estrutural que não existe em mais lado
 * nenhum. Coluna a `max-w-[68ch]` — texto jurídico corrido de ponta a ponta é
 * ilegível, e é onde a maioria dos exemplos que vimos falha.
 */
export function LegalDoc({ doc, seccoes }: { doc: DocMeta; seccoes: Seccao[] }) {
  const { anterior, seguinte } = vizinhos(doc.slug);

  return (
    <article className="mx-auto w-full max-w-[68ch] px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label="Migalhas" className="mb-4 text-sm text-ink-soft">
        <Link href="/legal" className="hover:text-ink">
          Legal
        </Link>
        <span className="mx-1.5" aria-hidden>
          /
        </span>
        <span className="text-ink">{doc.titulo}</span>
      </nav>

      <h1 className="font-display text-3xl font-semibold tracking-tight">{doc.titulo}</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Última atualização:{" "}
        <time dateTime={doc.atualizadoEm} className="text-ink">
          {formatDate(doc.atualizadoEm)}
        </time>
      </p>

      {EMPRESA_POR_PREENCHER && <AvisoRascunho />}

      {/* Índice */}
      <nav
        aria-label="Índice"
        className="mt-8 rounded-[10px] border border-line bg-surface-2 p-4 sm:p-5"
      >
        <p className="text-sm font-semibold">Índice · {seccoes.length} secções</p>
        <ol className="mt-3 space-y-0.5">
          {seccoes.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="flex gap-3 rounded-[6px] px-2 py-1.5 text-sm text-ink-soft hover:bg-surface hover:text-ink"
              >
                <span className="tnum text-ink-soft/60">{String(i + 1).padStart(2, "0")}</span>
                {s.titulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Corpo */}
      <div className="mt-10">
        {seccoes.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="mt-10 mb-3 font-display text-xl font-semibold first:mt-0">
              <span className="tnum mr-2 text-ink-soft/60">{i + 1}.</span>
              {s.titulo}
            </h2>
            <div className="text-[15px] leading-7 text-ink-soft [&_a]:text-amber [&_a]:underline [&_a]:underline-offset-2 [&_li]:mb-1.5 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
              {s.corpo}
            </div>
          </section>
        ))}
      </div>

      {/* Contacto */}
      <aside className="mt-12 flex gap-3 rounded-[10px] border border-line bg-surface-2 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
        <p className="text-ink-soft">
          Dúvidas sobre este documento?{" "}
          <a
            href={`mailto:${EMPRESA.emailLegal}`}
            className="text-amber underline underline-offset-2"
          >
            {EMPRESA.emailLegal}
          </a>
        </p>
      </aside>

      {/* Navegação entre documentos */}
      {(anterior || seguinte) && (
        <nav className="mt-8 flex items-stretch justify-between gap-3 border-t border-line pt-6">
          {anterior ? (
            <Link
              href={`/legal/${anterior.slug}`}
              className="group flex max-w-[48%] flex-col gap-0.5 text-sm hover:text-ink"
            >
              <span className="flex items-center gap-1 text-xs text-ink-soft">
                <ArrowLeft className="size-3" aria-hidden />
                Anterior
              </span>
              <span className="font-medium text-ink-soft group-hover:text-ink">
                {anterior.titulo}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {seguinte && (
            <Link
              href={`/legal/${seguinte.slug}`}
              className="group flex max-w-[48%] flex-col items-end gap-0.5 text-right text-sm"
            >
              <span className="flex items-center gap-1 text-xs text-ink-soft">
                Seguinte
                <ArrowRight className="size-3" aria-hidden />
              </span>
              <span className="font-medium text-ink-soft group-hover:text-ink">
                {seguinte.titulo}
              </span>
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}

/** Enquanto a identificação da entidade não estiver preenchida em lib/legal.ts. */
function AvisoRascunho() {
  return (
    <div className="mt-6 flex gap-3 rounded-[10px] border border-warn/40 bg-warn/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold text-ink">Documento em rascunho — não vinculativo</p>
        <p className="mt-1 text-ink-soft">
          Faltam a identificação da entidade e a revisão jurídica. Não sirvas isto a clientes como
          se fosse definitivo.
        </p>
      </div>
    </div>
  );
}

/**
 * Callout de destaque. O `estimativa` existe porque o disclaimer sobre a
 * natureza dos números é a cláusula com maior exposição do produto — não pode
 * ficar perdido no meio de texto corrido.
 */
export function Callout({
  variant = "info",
  titulo,
  children,
}: {
  variant?: "info" | "estimativa";
  titulo: string;
  children: React.ReactNode;
}) {
  const estimativa = variant === "estimativa";
  return (
    <div
      className={`my-4 flex gap-3 rounded-[10px] border p-4 ${
        estimativa ? "border-warn/40 bg-warn/10" : "border-line bg-surface-2"
      }`}
    >
      {estimativa ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
      )}
      <div>
        <p className="font-semibold text-ink">{titulo}</p>
        <div className="mt-1 [&_p]:mb-2 [&_p:last-child]:mb-0">{children}</div>
      </div>
    </div>
  );
}
