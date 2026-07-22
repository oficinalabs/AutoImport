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

  // Imagens externas autorizadas no <Image>: SÓ o catálogo ultimatespecs
  // (imagem principal da versão/galeria do modelo — ver Listing.catalogImage).
  //
  // As fotos dos próprios anúncios (AutoScout24, leparking, olxcdn…) NÃO entram
  // aqui de propósito: são ~24 CDNs e cada coletor novo traz mais, portanto um
  // allowlist obrigaria a editar este ficheiro + redeploy só para a foto não
  // rebentar. Servem-se com <img> normal em components/car-image.tsx.
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
