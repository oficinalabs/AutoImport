import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://autoimport.arestadigital.pt";

// A app (atrás de login, futuramente) fica fora dos motores de busca;
// só a landing é pública/indexável. Ver docs/02-FRONTEND.md (SEO).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/painel",
          "/pesquisar",
          "/anuncio/",
          "/comparar",
          "/negociacoes",
          "/compras",
          "/favoritos",
          "/alertas",
          "/stand",
          "/entrar",
          "/registar",
          "/recuperar",
          // ⚠️ TEMPORÁRIO — maquetes de design em public/mockups/, publicadas
          // em produção só para a equipa as poder ver sem a proteção que tranca
          // os previews da Vercel. Sai daqui quando as maquetes saírem.
          // Quem impede mesmo a indexação é o <meta name="robots" noindex> que
          // cada página tem; isto só evita o rastreio.
          "/mockups/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
