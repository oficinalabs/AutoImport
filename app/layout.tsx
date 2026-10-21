import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["500", "600", "700"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://autoimport.arestadigital.pt";

export const metadata: Metadata = {
  // Sem metadataBase, as imagens e os canonical relativos não viram URLs
  // absolutos e os links partilhados (WhatsApp, LinkedIn) saem sem imagem.
  metadataBase: new URL(BASE_URL),
  title: "AutoImport — importa com contas",
  description:
    "Descobre que carros compensa importar da Europa, com o custo final estimado já com ISV, IUC, transporte e legalização.",
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "AutoImport",
    images: [{ url: "/video/hero-camiao-poster.jpg", alt: "AutoImport" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <body className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
