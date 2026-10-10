import * as Sentry from "@sentry/nextjs";

/**
 * Arranque do Sentry no servidor. O Next chama `register()` uma vez por runtime.
 * Sem DSN, os `sentry.*.config.ts` não inicializam nada (ver lá).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Erros de Server Component, route handlers e server actions — a classe de
// erro que já partiu a produção (ver CLAUDE.md). O `digest` que a UI mostra é o
// mesmo que fica no evento, para se cruzar um com o outro.
export const onRequestError = Sentry.captureRequestError;
