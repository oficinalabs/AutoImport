import { PublicIsvCalculator } from "@/components/public-isv-calculator";
import type { TaxTables } from "@/lib/cost-engine/types";
import type { Metadata } from "next";

/**
 * Calculadora de ISV pública: a porta de entrada de quem pesquisa "calcular ISV
 * carro importado". As tabelas fiscais lêem-se uma vez por dia (ISR) e vão para
 * o browser, onde corre a conta — nenhum clique toca na base de dados.
 */
export const revalidate = 86400;

const TITULO = "Calculadora de ISV para carros importados · AutoImport";
const DESCRICAO =
  "Calcula o ISV de um carro usado importado da Alemanha, França, Bélgica, Holanda ou Espanha, com IUC, transporte e legalização. Grátis e sem registo.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/calculadora-isv" },
  openGraph: { title: TITULO, description: DESCRICAO, url: "/calculadora-isv" },
};

async function tabelasDoAno(): Promise<TaxTables | null> {
  try {
    const { db } = await import("@/db");
    const { loadTaxTables } = await import("@/lib/engine/tax-tables");
    return await loadTaxTables(db, new Date().getFullYear());
  } catch (err) {
    // O detalhe fica nos logs; ao visitante só dizemos que está indisponível.
    console.error("calculadora-isv: falha a carregar as tabelas", err);
    return null;
  }
}

export default async function CalculadoraIsvPage() {
  const tables = await tabelasDoAno();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Calculadora de ISV para carros importados
      </h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Indica os dados do anúncio e vê quanto pagas de ISV e quanto custa pôr o carro em Portugal,
        com IUC, transporte e legalização. Grátis e sem registo.
      </p>
      <div className="mt-8">
        {tables ? (
          <PublicIsvCalculator tables={tables} />
        ) : (
          <p className="rounded-[10px] border border-line bg-surface p-5 text-sm text-ink-soft">
            A calculadora está indisponível neste momento. Tenta mais tarde.
          </p>
        )}
      </div>
    </div>
  );
}
