import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Páginas legais e de ajuda: públicas, indexáveis, com o mesmo cabeçalho e
 * rodapé da landing. Não usam a top bar da app — quem lê isto pode nem ter
 * conta.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
