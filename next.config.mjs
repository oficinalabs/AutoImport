/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 * Objetivo: reduzir a superfície de ataque (clickjacking, sniffing,
 * fuga de referrer, acesso a APIs do browser) sem partir a app.
 */
const securityHeaders = [
  // Impede que o site seja embebido noutro (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o browser de "adivinhar" tipos de conteúdo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não vaza o URL completo (com tokens) para sites externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs que a app não usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Isola a origem contra ataques cross-origin (Spectre-like).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Força HTTPS durante 2 anos (só tem efeito em HTTPS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Não anunciar a stack.
  poweredByHeader: false,

  // Imagens externas autorizadas no <Image>. Por agora SÓ o catálogo
  // ultimatespecs (imagem principal da versão/galeria do modelo — ver
  // Listing.catalogImage); as fotos dos próprios anúncios (AutoScout24,
  // leparking, olxcdn…) entram aqui quando as formos mostrar.
  // Ver docs/07-FRONTEND-HANDOFF.md.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.ultimatespecs.com", pathname: "/cargallery/**" },
    ],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
