import { LegalDoc, type Seccao } from "@/components/legal-doc";
import { CONDICOES, DOCS, EMPRESA } from "@/lib/legal";
import type { Metadata } from "next";
import Link from "next/link";

const doc = DOCS.subscricao;

export const metadata: Metadata = {
  title: `${doc.titulo} — AutoImport`,
  description: doc.descricao,
};

const SECCOES: Seccao[] = [
  {
    id: "preco",
    titulo: "Preço",
    corpo: (
      <p>
        <strong>{CONDICOES.precoMensalEuros} € por mês, mais IVA</strong>, por stand. Inclui toda a
        equipa do stand e todas as funcionalidades — não há níveis nem extras.
      </p>
    ),
  },
  {
    id: "trial",
    titulo: "Primeiro mês grátis",
    corpo: (
      <>
        <p>
          O primeiro mês é gratuito e <strong>não pedimos cartão no registo</strong>.
        </p>
        <p>
          Quando o mês acabar, <strong>não há cobrança automática</strong>: para continuar, tens de
          escolher continuar e introduzir os dados de pagamento. Se não fizeres nada, o acesso
          termina. Não te cobramos nada por engano.
        </p>
      </>
    ),
  },
  {
    id: "faturacao",
    titulo: "Faturação",
    corpo: (
      <>
        <p>
          A partir do segundo mês, a subscrição é cobrada mensalmente e de forma antecipada, na data
          equivalente à da adesão. A fatura sai com o NIF do stand.
        </p>
        <p>
          Os pagamentos são processados pela <strong>Polar</strong>, que atua como{" "}
          <em>Merchant of Record</em> — é a Polar que trata do pagamento e emite a fatura. Nunca
          vemos nem guardamos os dados do teu cartão.
        </p>
      </>
    ),
  },
  {
    id: "cancelar",
    titulo: "Cancelar",
    corpo: (
      <>
        <p>
          Cancelas na página da tua conta, sem justificação e sem falar com ninguém. Não há
          fidelização nem período mínimo.
        </p>
        <p>
          Depois de cancelar, mantens o acesso <strong>até ao fim do período já pago</strong>. Não
          há mais cobranças.
        </p>
      </>
    ),
  },
  {
    id: "reembolsos",
    titulo: "Reembolsos",
    corpo: (
      <>
        <p>
          Se cancelares nos primeiros <strong>{CONDICOES.reembolsoDias} dias</strong> após uma
          cobrança e não estiveres satisfeito, devolvemos esse mês. Escreve para{" "}
          <a href={`mailto:${EMPRESA.emailLegal}`}>{EMPRESA.emailLegal}</a>.
        </p>
        <p>
          Fora dessa janela, não há reembolso de períodos já decorridos — mas também não há
          cobranças novas depois de cancelares.
        </p>
      </>
    ),
  },
  {
    id: "falta-pagamento",
    titulo: "Falta de pagamento",
    corpo: (
      <p>
        Se um pagamento falhar, avisamos e a conta fica <strong>suspensa</strong>, não eliminada. Os
        dados ficam lá e regularizando o pagamento voltas a ter acesso. Ver os prazos de conservação
        na <Link href="/legal/privacidade">Política de Privacidade</Link>.
      </p>
    ),
  },
  {
    id: "alteracoes-preco",
    titulo: "Alterações de preço",
    corpo: (
      <p>
        Se mudarmos o preço, avisamos por email com pelo menos{" "}
        <strong>{CONDICOES.preAvisoDias} dias</strong> de antecedência. Podes cancelar sem
        penalização durante esse período. O preço nunca muda a meio de um período já pago.
      </p>
    ),
  },
];

export default function SubscricaoPage() {
  return <LegalDoc doc={doc} seccoes={SECCOES} />;
}
