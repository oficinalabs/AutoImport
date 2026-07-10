"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

/**
 * Providers globais do cliente.
 * - next-themes: dark mode via classe (.dark) — ver docs/01-DESIGN.md
 * - TanStack Query: cache de dados remotos. Hoje as queries leem a camada
 *   mock (lib/data). Quando o backend existir, só muda o corpo dessas
 *   funções — os componentes não mudam. Ver docs/07-FRONTEND-HANDOFF.md.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
