"use client";

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import Link from "next/link";

/**
 * Ecrã de erro do produto.
 *
 * Regra: **nunca** mostrar `error.message` nem stack traces ao utilizador —
 * podem trazer SQL, nomes de tabelas ou caminhos internos. Só o `digest`,
 * que é um identificador opaco e serve para cruzar com os logs no suporte.
 */
export function ErrorState({
  title = "Isto não devia ter acontecido",
  description = "Tivemos um problema a carregar esta página. Já estamos a par e a tratar disso.",
  digest,
  onRetry,
  homeHref = "/",
  homeLabel = "Voltar ao início",
}: {
  title?: string;
  description?: string;
  digest?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-[460px] text-center">
        {/* Marca discreta — o âmbar sinaliza sem alarmar */}
        <div
          aria-hidden
          className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-amber/12"
        >
          <span className="size-2.5 rounded-full bg-amber" />
        </div>

        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm text-ink-soft">{description}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="accent" onClick={onRetry}>
              <RotateCw className="size-4" />
              Tentar de novo
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>

        {digest && (
          <p className="mt-6 border-t border-line pt-4 text-xs text-ink-soft">
            Se falares connosco, dá-nos esta referência:{" "}
            <code className="tnum rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink">
              {digest}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
