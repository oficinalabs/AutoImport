import { DOCUMENTOS } from "@/lib/legal";
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://autoimport.arestadigital.pt";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/ajuda`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/legal`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...DOCUMENTOS.map((d) => ({
      url: `${BASE_URL}/legal/${d.slug}`,
      lastModified: new Date(d.atualizadoEm),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
