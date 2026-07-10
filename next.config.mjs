/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Imagens dos anúncios virão de fontes externas (AutoScout24, mobile.de, etc.).
  // O backend deve devolver URLs e estes hosts entram aqui. Ver docs/07-FRONTEND-HANDOFF.md.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
