import { ErrorState } from "@/components/error-state";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página não encontrada — AutoImport",
  robots: { index: false, follow: false },
};

/**
 * 404 do produto. Reaproveita o ErrorState (sem digest — não há erro nenhum,
 * só um endereço que não existe) para o 404 não destoar do resto.
 */
export default function NotFound() {
  return (
    <ErrorState
      title="Página não encontrada"
      description="O endereço que abriste não existe ou foi movido. Se chegaste aqui por um link nosso, avisa-nos."
      homeHref="/"
      homeLabel="Voltar ao início"
    />
  );
}
