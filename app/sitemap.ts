import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://autoimport.arestadigital.pt";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
