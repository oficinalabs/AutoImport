"use client";

import { ErrorState } from "@/components/error-state";
import { useEffect } from "react";

/**
 * Erro em qualquer página fora da app (landing, auth) e rede de segurança
 * para o resto. Substitui o ecrã default do Next ("Application error: a
 * server-side exception has occurred…"), que não pode aparecer a clientes.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vai para os logs da Vercel (e para o Sentry quando existir).
    console.error("[error boundary]", error);
  }, [error]);

  return <ErrorState digest={error.digest} onRetry={reset} />;
}
