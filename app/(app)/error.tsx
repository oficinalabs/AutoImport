"use client";

import { ErrorState } from "@/components/error-state";
import { useEffect } from "react";

/**
 * Erro dentro da app autenticada. O layout (top bar) mantém-se, por isso o
 * utilizador continua a navegar em vez de ficar preso num ecrã morto.
 *
 * Foi um erro assim que apareceu em produção quando o painel leu `listings`
 * sem a tabela existir — ver CLAUDE.md.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <ErrorState
      title="Não conseguimos carregar isto"
      description="Houve um problema a obter os dados. Tenta de novo — se continuar, avisa-nos com a referência abaixo."
      digest={error.digest}
      onRetry={reset}
      homeHref="/painel"
      homeLabel="Ir para o painel"
    />
  );
}
