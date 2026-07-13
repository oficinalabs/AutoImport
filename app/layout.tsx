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

export const metadata: Metadata = {
  title: "AutoImport — importa com contas",
  description:
    "Descobre que carros compensa importar da Europa, com o custo final real já com ISV, IUC e legalização.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
