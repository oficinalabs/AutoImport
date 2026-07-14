import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Proteção de rotas da app. Verificação **otimista** (só a presença do cookie
 * de sessão) — leve e compatível com o Edge. A validação real da sessão é feita
 * nas páginas/actions do servidor. Ver docs/03-BACKEND.md.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/entrar", request.url);
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

// Rotas da app (o grupo (app)). A landing, os ecrãs de auth e /api/auth ficam livres.
export const config = {
  matcher: [
    "/painel/:path*",
    "/pesquisar/:path*",
    "/anuncio/:path*",
    "/comparar/:path*",
    "/negociacoes/:path*",
    "/compras/:path*",
    "/favoritos/:path*",
    "/alertas/:path*",
    "/stand/:path*",
  ],
};
