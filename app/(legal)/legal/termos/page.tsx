import { Callout, LegalDoc, type Seccao } from "@/components/legal-doc";
import { CONDICOES, DOCS, EMPRESA } from "@/lib/legal";
import type { Metadata } from "next";
import Link from "next/link";

const doc = DOCS.termos;

export const metadata: Metadata = {
  title: `${doc.titulo} — AutoImport`,
  description: doc.descricao,
};

const SECCOES: Seccao[] = [
  {
    id: "quem-somos",
    titulo: "Quem presta este serviço",
    corpo: (
      <>
        <p>
          O AutoImport é operado por <strong>{EMPRESA.denominacao}</strong>, NIPC{" "}
          <strong>{EMPRESA.nipc}</strong>, com sede em <strong>{EMPRESA.sede}</strong> (adiante
          “AutoImport” ou “nós”).
        </p>
        <p>
          Estes termos regulam o uso da plataforma disponível em autoimport.arestadigital.pt. Ao
          criar conta, o teu stand aceita-os.
        </p>
      </>
    ),
  },
  {
    id: "objeto",
    titulo: "O que o serviço faz",
    corpo: (
      <>
        <p>
          O AutoImport estima <strong>quanto custaria importar um automóvel</strong> de outro país
          europeu para Portugal — incluindo imposto sobre veículos (ISV), imposto único de
          circulação (IUC), transporte e legalização — e compara esse valor com uma{" "}
          <strong>referência de preço do mercado português</strong> para veículos semelhantes.
        </p>
        <p>
          É uma <strong>ferramenta de apoio à decisão</strong>. Não vendemos automóveis, não
          intermediamos a compra, não tratamos da legalização e não somos parte em nenhum negócio
          que o teu stand faça.
        </p>
      </>
    ),
  },
  {
    id: "b2b",
    titulo: "A quem se destina",
    corpo: (
      <>
        <p>
          O AutoImport destina-se exclusivamente a <strong>profissionais do setor automóvel</strong>{" "}
          — stands e empresas com atividade aberta — no exercício da sua atividade. Não é um serviço
          para consumidores finais.
        </p>
        <p>
          Ao criar conta, declaras que o fazes em nome de uma empresa e no âmbito da atividade dela.
        </p>
      </>
    ),
  },
  {
    id: "conta",
    titulo: "Conta e stand",
    corpo: (
      <>
        <p>
          Cada stand é uma conta. Quem cria a conta fica como <strong>dono</strong> e é responsável
          pelo que se faz dentro dela.
        </p>
        <ul>
          <li>As credenciais são pessoais e não podem ser partilhadas fora do stand.</li>
          <li>Avisa-nos assim que suspeitares de acesso indevido.</li>
          <li>
            Os dados que registas (nome, NIF, morada, telefone) devem ser verdadeiros e atuais.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "preco",
    titulo: "Preço e subscrição",
    corpo: (
      <>
        <p>
          A subscrição custa{" "}
          <strong>{CONDICOES.precoMensalEuros} € por mês, acrescido de IVA</strong>, por stand. O
          primeiro mês é gratuito e <strong>não pedimos cartão no registo</strong>.
        </p>
        <p>
          As condições completas — faturação, cancelamento, reembolsos e alterações de preço — estão
          em <Link href="/legal/subscricao">Subscrição e Reembolsos</Link>, que faz parte destes
          termos.
        </p>
      </>
    ),
  },
  {
    id: "estimativas",
    titulo: "A natureza dos números que mostramos",
    corpo: (
      <>
        <Callout variant="estimativa" titulo="Os valores são estimativas, não garantias.">
          <p>
            Uma decisão de importar um automóvel envolve milhares de euros. Lê esta secção antes de
            tomar uma com base no que te mostramos.
          </p>
        </Callout>
        <p>Concretamente:</p>
        <ul>
          <li>
            <strong>O ISV e o IUC são estimados</strong> com base na lei em vigor no momento do
            cálculo. Não substituem a liquidação feita pela Autoridade Tributária e Aduaneira no ato
            de matrícula, que é a única que conta.
          </li>
          <li>
            <strong>Os preços de referência do mercado português são indicativos</strong> e
            calculados a partir de dados de mercado. Não garantimos que encontrarás aquele preço.
          </li>
          <li>
            <strong>Os anúncios podem estar desatualizados.</strong> Um veículo pode já ter sido
            vendido, ter outro preço, ou ter um estado diferente do anunciado. Confirma sempre
            diretamente com o vendedor.
          </li>
          <li>
            <strong>A lei muda.</strong> Pode haver desfasamento entre uma alteração fiscal entrar
            em vigor e estar refletida na plataforma.
          </li>
        </ul>
        <p>
          Não prestamos aconselhamento fiscal, jurídico nem de investimento. A decisão de importar —
          e as suas consequências — é sempre do teu stand.
        </p>
      </>
    ),
  },
  {
    id: "uso-aceitavel",
    titulo: "Uso aceitável",
    corpo: (
      <p>
        Há regras sobre o que se pode fazer com a plataforma e com os dados que ela mostra. Estão em{" "}
        <Link href="/legal/uso-aceitavel">Uso Aceitável</Link>, que faz parte destes termos.
        Incumprir essas regras pode levar à suspensão da conta (secção 11).
      </p>
    ),
  },
  {
    id: "propriedade",
    titulo: "Propriedade intelectual",
    corpo: (
      <>
        <p>
          A plataforma, o código, o design, a marca e os cálculos são nossos. A subscrição dá ao teu
          stand uma <strong>licença de uso</strong>, limitada à duração da subscrição, não exclusiva
          e não transmissível — não transfere propriedade de nada.
        </p>
        <p>
          Os dados que introduzes (dados do stand, favoritos, alertas) continuam teus. Usamo-los
          para prestar o serviço, conforme a{" "}
          <Link href="/legal/privacidade">Política de Privacidade</Link>.
        </p>
      </>
    ),
  },
  {
    id: "dados-pessoais",
    titulo: "Dados pessoais",
    corpo: (
      <p>
        O tratamento de dados pessoais está descrito na{" "}
        <Link href="/legal/privacidade">Política de Privacidade</Link> e na{" "}
        <Link href="/legal/cookies">Política de Cookies</Link>.
      </p>
    ),
  },
  {
    id: "responsabilidade",
    titulo: "Limitação de responsabilidade",
    corpo: (
      <>
        <p>
          O serviço é prestado tal como está. Não garantimos que esteja sempre disponível, sem
          erros, nem que os valores estimados estejam corretos (secção 6).
        </p>
        <p>
          Na medida permitida por lei, a nossa responsabilidade total perante o teu stand está
          limitada ao{" "}
          <strong>
            valor que nos pagaste nos {CONDICOES.tetoResponsabilidadeMeses} meses anteriores
          </strong>{" "}
          ao facto que a origina.
        </p>
        <p>
          Esta limitação <strong>não se aplica</strong> a danos causados por dolo ou negligência
          grosseira, nem a qualquer responsabilidade que a lei portuguesa não permita excluir.
        </p>
      </>
    ),
  },
  {
    id: "suspensao",
    titulo: "Suspensão e rescisão",
    corpo: (
      <>
        <p>
          Podes cancelar quando quiseres, sem justificação — ver{" "}
          <Link href="/legal/subscricao">Subscrição e Reembolsos</Link>.
        </p>
        <p>
          Podemos suspender ou encerrar uma conta se houver incumprimento destes termos ou do{" "}
          <Link href="/legal/uso-aceitavel">Uso Aceitável</Link>, ou falta de pagamento. Exceto em
          casos graves, avisamos primeiro e damos oportunidade de regularizar.
        </p>
      </>
    ),
  },
  {
    id: "alteracoes",
    titulo: "Alterações a estes termos",
    corpo: (
      <p>
        Podemos alterar estes termos. Se a alteração for <strong>material</strong>, avisamos por
        email com pelo menos <strong>{CONDICOES.preAvisoDias} dias</strong> de antecedência, e podes
        cancelar sem penalização durante esse período. Cada documento mostra a data da última
        atualização.
      </p>
    ),
  },
  {
    id: "lei",
    titulo: "Lei aplicável e foro",
    corpo: (
      <p>
        Aplica-se a lei portuguesa. Para litígios que não se resolvam por acordo, é competente o
        foro da comarca de <strong>{EMPRESA.foro}</strong>, com renúncia a qualquer outro.
      </p>
    ),
  },
  {
    id: "contacto",
    titulo: "Contacto",
    corpo: (
      <p>
        Para assuntos contratuais: <a href={`mailto:${EMPRESA.emailLegal}`}>{EMPRESA.emailLegal}</a>
        . Para dados pessoais:{" "}
        <a href={`mailto:${EMPRESA.emailPrivacidade}`}>{EMPRESA.emailPrivacidade}</a>.
      </p>
    ),
  },
];

export default function TermosPage() {
  return <LegalDoc doc={doc} seccoes={SECCOES} />;
}
