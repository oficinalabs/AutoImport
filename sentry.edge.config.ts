import * as Sentry from "@sentry/nextjs";

/**
 * Sentry no runtime Edge (o `middleware.ts`). Carregado pelo `instrumentation.ts`.
 *
 * Sem `NEXT_PUBLIC_SENTRY_DSN` não se inicializa nada: o SDK fica inerte e o
 * `captureRequestError`/`captureException` não fazem nada. Só erros — sem
 * tracing, sem Replay (ver MVP.md, P2).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Sem IP, cookies nem headers de pedido nos eventos.
    sendDefaultPii: false,
  });
}
