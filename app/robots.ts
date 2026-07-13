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
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
