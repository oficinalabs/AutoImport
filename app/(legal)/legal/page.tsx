import { formatDate } from "@/lib/format";
import { DOCUMENTOS } from "@/lib/legal";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal — AutoImport",
  description: "Termos, privacidade, cookies e condições de subscrição do AutoImport.",
};

export default function LegalIndexPage() {
  return (
    <div className="mx-auto w-full max-w-[68ch] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Legal</h1>
      <p className="mt-2 text-ink-soft">
        Os documentos que regulam o uso do AutoImport. Escritos para serem lidos, não para serem
        saltados.
      </p>

      <ul className="mt-8 flex flex-col gap-2">
        {DOCUMENTOS.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="group flex items-center gap-4 rounded-[10px] border border-line p-4 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{d.titulo}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{d.descricao}</p>
                <p className="mt-1 text-xs text-ink-soft/70">
                  Atualizado a {formatDate(d.atualizadoEm)}
                </p>
              </div>
              <ArrowRight
                className="size-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-ink-soft">
        Procuras respostas práticas em vez de linguagem de contrato? Vê as{" "}
        <Link href="/ajuda" className="text-amber underline underline-offset-2">
          perguntas frequentes
        </Link>
        .
      </p>
    </div>
  );
}
