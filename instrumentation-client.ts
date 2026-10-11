/**
 * Sentry no browser. Init condicional de propósito: um `Sentry.init` com DSN
 * vazio não envia nada, mas instala handlers globais e embrulha o `fetch`.
 * Sem `NEXT_PUBLIC_SENTRY_DSN` a app fica exatamente como estava.
 *
 * Só erros: sem `browserTracingIntegration` e sem Session Replay (o Replay
 * obrigaria a abrir `worker-src blob:` na CSP e não combina com a postura de
 * privacidade do projeto). Os eventos vão para `/monitoring` na nossa origem
 * (`tunnelRoute` no `next.config.mjs`), por isso o `connect-src 'self'` da CSP
 * fica como está.
 *
 * O SDK (~75 kB) entra por `import()` só quando há DSN: sem ele, o primeiro
 * carregamento de cada página não ganha um byte.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // Sem sessões ("release health"): mandariam um pedido a `/monitoring` em
      // cada página aberta, e cada um é uma invocação na Vercel. Só erros.
      integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
    }),
  );
}
