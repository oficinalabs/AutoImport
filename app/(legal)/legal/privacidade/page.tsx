import { LegalDoc, type Seccao } from "@/components/legal-doc";
import { CONDICOES, DOCS, EMPRESA } from "@/lib/legal";
import type { Metadata } from "next";
import Link from "next/link";

const doc = DOCS.privacidade;

export const metadata: Metadata = {
  title: `${doc.titulo} — AutoImport`,
  description: doc.descricao,
};

/** Subcontratantes reais. Nomeados: "parceiros" genéricos é o que a CNPD critica. */
const SUBCONTRATANTES = [
  {
    nome: "Supabase",
    funcao: "Base de dados",
    dados: "Dados da conta e do stand",
    onde: "UE (Frankfurt)",
  },
  {
    nome: "Vercel",
    funcao: "Alojamento da aplicação",
    dados: "Dados em trânsito, registos técnicos",
    onde: "EUA",
  },
  { nome: "Resend", funcao: "Envio de emails", dados: "Nome e email do destinatário", onde: "EUA" },
  {
    nome: "Polar",
    funcao: "Pagamentos (Merchant of Record)",
    dados: "Dados de faturação do stand",
    onde: "EUA",
  },
];

const SECCOES: Seccao[] = [
  {
    id: "responsavel",
    titulo: "Quem é responsável pelos teus dados",
    corpo: (
      <>
        <p>
          O responsável pelo tratamento é <strong>{EMPRESA.denominacao}</strong>, NIPC{" "}
          <strong>{EMPRESA.nipc}</strong>, com sede em <strong>{EMPRESA.sede}</strong>.
        </p>
        <p>
          Para qualquer questão sobre esta política ou sobre os teus dados:{" "}
          <a href={`mailto:${EMPRESA.emailPrivacidade}`}>{EMPRESA.emailPrivacidade}</a>.
        </p>
      </>
    ),
  },
  {
    id: "dados",
    titulo: "Que dados tratamos e com que fundamento",
    corpo: (
      <>
        <p>
          Só tratamos o que é preciso para o serviço funcionar. Por cada dado, o motivo e a base
          legal que o permite:
        </p>
        <Tabela
          cabecalho={["Dado", "Para quê", "Fundamento (RGPD)"]}
          linhas={[
            [
              "Nome e email de quem usa a conta",
              "Criar a conta, autenticar, enviar emails de serviço",
              "Execução do contrato — art. 6.º/1/b",
            ],
            [
              "Nome do stand, NIF, morada, telefone",
              "Formalizar a relação comercial e faturar",
              "Execução do contrato — art. 6.º/1/b · Obrigação legal (faturação) — art. 6.º/1/c",
            ],
            [
              "Cookie de sessão",
              "Manter-te com sessão iniciada",
              "Estritamente necessário — isento de consentimento (art. 5.º/2 da Lei 41/2004)",
            ],
          ]}
        />
        <p>
          <strong>Não</strong> recolhemos dados de cartão: quem trata do pagamento é a Polar. Nunca
          vendemos dados nem os usamos para publicidade.
        </p>
        <p>
          Os anúncios de automóveis que a plataforma mostra não são dados pessoais — são dados de
          veículos e de mercado.
        </p>
      </>
    ),
  },
  {
    id: "conservacao",
    titulo: "Quanto tempo guardamos",
    corpo: (
      <>
        <Tabela
          cabecalho={["Dado", "Prazo"]}
          linhas={[
            [
              "Dados de faturação (associados a NIF)",
              "10 anos — exigido pela lei fiscal portuguesa",
            ],
            ["Dados da conta e do stand", "Enquanto a subscrição estiver ativa"],
            [
              "Dados da conta depois de cancelares",
              `${CONDICOES.retencaoContaDias} dias, para poderes reativar — depois disso, apagados`,
            ],
            ["Cookie de sessão", "Até terminares sessão ou expirar"],
          ]}
        />
      </>
    ),
  },
  {
    id: "partilha",
    titulo: "Com quem partilhamos",
    corpo: (
      <>
        <p>
          Com os fornecedores necessários para o serviço funcionar — e mais ninguém. Não são
          “parceiros” vagos, são estes:
        </p>
        <Tabela
          cabecalho={["Quem", "Para quê", "O que vê", "Onde"]}
          linhas={SUBCONTRATANTES.map((s) => [s.nome, s.funcao, s.dados, s.onde])}
        />
        <p>
          Podemos ainda ter de divulgar dados quando a lei o exigir (por exemplo, a pedido de um
          tribunal).
        </p>
      </>
    ),
  },
  {
    id: "transferencias",
    titulo: "Dados fora da União Europeia",
    corpo: (
      <>
        <p>
          A base de dados está na <strong>União Europeia</strong> (Frankfurt). Alguns fornecedores
          acima estão sediados nos <strong>Estados Unidos</strong>, o que implica transferência
          internacional, feita ao abrigo dos mecanismos legais previstos no RGPD (Data Privacy
          Framework e/ou cláusulas contratuais-tipo).
        </p>
      </>
    ),
  },
  {
    id: "direitos",
    titulo: "Os teus direitos",
    corpo: (
      <>
        <p>Sobre os teus dados pessoais, tens direito a:</p>
        <ul>
          <li>
            <strong>Aceder</strong> — saber que dados temos sobre ti e obter uma cópia.
          </li>
          <li>
            <strong>Retificar</strong> — corrigir o que estiver errado (os dados do stand podes
            corrigir tu na página da conta).
          </li>
          <li>
            <strong>Apagar</strong> — pedir a eliminação, salvo o que a lei nos obriga a manter (por
            exemplo, faturação).
          </li>
          <li>
            <strong>Limitar</strong> ou <strong>opor-te</strong> a certos tratamentos.
          </li>
          <li>
            <strong>Portabilidade</strong> — receber os teus dados num formato aberto.
          </li>
        </ul>
        <p>
          Escreve para <a href={`mailto:${EMPRESA.emailPrivacidade}`}>{EMPRESA.emailPrivacidade}</a>
          . Respondemos no prazo de um mês.
        </p>
      </>
    ),
  },
  {
    id: "reclamacao",
    titulo: "Reclamar",
    corpo: (
      <p>
        Se achares que tratámos mal os teus dados, diz-nos primeiro — mas tens sempre o direito de
        apresentar reclamação à <strong>CNPD</strong> (Comissão Nacional de Proteção de Dados),{" "}
        <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer">
          cnpd.pt
        </a>
        .
      </p>
    ),
  },
  {
    id: "seguranca",
    titulo: "Segurança",
    corpo: (
      <>
        <p>
          Os dados viajam cifrados (HTTPS) e são guardados cifrados. As passwords nunca são
          guardadas em texto simples. O acesso ao painel exige email confirmado, e as tentativas de
          entrada são limitadas.
        </p>
        <p>
          Nenhum sistema é infalível. Se houver uma violação de dados que te ponha em risco,
          avisamos — e à CNPD — nos prazos que o RGPD exige.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    titulo: "Cookies",
    corpo: (
      <p>
        Hoje usamos apenas um cookie, o de sessão. Detalhe em{" "}
        <Link href="/legal/cookies">Política de Cookies</Link>.
      </p>
    ),
  },
  {
    id: "alteracoes",
    titulo: "Alterações a esta política",
    corpo: (
      <p>
        Se mudarmos alguma coisa relevante, atualizamos a data no topo e avisamos por email com{" "}
        {CONDICOES.preAvisoDias} dias de antecedência.
      </p>
    ),
  },
];

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {cabecalho.map((h) => (
              <th key={h} className="py-2 pr-3 font-semibold text-ink">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.join("|")} className="border-b border-line align-top">
              {linha.map((celula) => (
                <td key={celula} className="py-2 pr-3 text-ink-soft">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacidadePage() {
  return <LegalDoc doc={doc} seccoes={SECCOES} />;
}
