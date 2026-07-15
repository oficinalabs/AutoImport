import { CONDICOES, EMPRESA } from "@/lib/legal";
import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Perguntas frequentes — AutoImport",
  description:
    "De onde vêm os dados, se o ISV é o valor oficial, quanto custa, e o que acontece se cancelares.",
};

interface Pergunta {
  q: string;
  a: React.ReactNode;
}

interface Categoria {
  id: string;
  titulo: string;
  perguntas: Pergunta[];
}

const CATEGORIAS: Categoria[] = [
  {
    id: "numeros",
    titulo: "Os números que mostramos",
    perguntas: [
      {
        q: "De onde vêm os dados?",
        a: (
          <>
            <p>
              Cruzamos as tabelas fiscais oficiais (ISV e IUC, como publicadas pela Autoridade
              Tributária) com referências de preço recolhidas de fontes públicas de mercado.
            </p>
            <p>
              O que te entregamos é uma <strong>estimativa de custo e uma comparação</strong> — não
              uma cópia do anúncio de ninguém.
            </p>
          </>
        ),
      },
      {
        q: "O ISV que me mostram é o valor oficial?",
        a: (
          <p>
            <strong>Não.</strong> É a nossa melhor estimativa com base na lei em vigor no momento do
            cálculo. Não substitui a liquidação da Alfândega no ato de matrícula. Confirma sempre
            antes de fechar negócio ou assumir compromissos com um cliente.
          </p>
        ),
      },
      {
        q: "E se o carro já tiver sido vendido?",
        a: (
          <p>
            Pode acontecer — os dados não são garantidamente em tempo real. O AutoImport serve para
            decidir <strong>se compensa procurar</strong> aquele tipo de carro naquele mercado; não
            é uma montra de stock disponível agora. Confirma a disponibilidade com o vendedor antes
            de viajares ou adiantares dinheiro.
          </p>
        ),
      },
      {
        q: "Se eu importar com base numa estimativa errada, a responsabilidade é vossa?",
        a: (
          <p>
            Não. O AutoImport é uma ferramenta de apoio à decisão, não aconselhamento fiscal
            vinculativo — a decisão de importar é sempre do stand. As condições estão na{" "}
            <Link href="/legal/termos#responsabilidade">secção 10 dos Termos</Link>.
          </p>
        ),
      },
      {
        q: "E se a lei do ISV mudar depois de eu ter consultado?",
        a: (
          <p>
            O valor pode deixar de ser válido. Atualizamos as tabelas assim que há alteração
            legislativa, mas pode haver desfasamento entre a mudança entrar em vigor e estar
            refletida na plataforma. Confirma sempre antes de formalizar.
          </p>
        ),
      },
    ],
  },
  {
    id: "preco",
    titulo: "Preço e faturação",
    perguntas: [
      {
        q: "Quanto custa?",
        a: (
          <p>
            {CONDICOES.precoMensalEuros} €/mês + IVA, por stand. Toda a equipa incluída. Detalhe em{" "}
            <Link href="/legal/subscricao">Subscrição e Reembolsos</Link>.
          </p>
        ),
      },
      {
        q: "Preciso de cartão para experimentar?",
        a: (
          <p>
            <strong>Não.</strong> O primeiro mês é grátis e não pedimos cartão no registo. Quando
            acabar, não há cobrança automática: só te cobramos se escolheres continuar.
          </p>
        ),
      },
      {
        q: "Há fidelização?",
        a: <p>Não. É mensal, sem período mínimo. Cancelas quando quiseres.</p>,
      },
      {
        q: "E se cancelar a meio do mês?",
        a: (
          <p>
            Mantens o acesso até ao fim do período já pago e não há cobranças novas. Se cancelares
            nos primeiros {CONDICOES.reembolsoDias} dias após uma cobrança e não estiveres
            satisfeito, devolvemos esse mês.
          </p>
        ),
      },
    ],
  },
  {
    id: "conta",
    titulo: "Conta e dados",
    perguntas: [
      {
        q: "É só para stands ou também para particulares?",
        a: (
          <p>
            É feito para profissionais do setor com atividade aberta, não para consumidores finais —
            ver <Link href="/legal/termos#b2b">secção 3 dos Termos</Link>.
          </p>
        ),
      },
      {
        q: "Quem vê os meus dados?",
        a: (
          <p>
            Só nós e os fornecedores necessários para o serviço funcionar (alojamento, email,
            faturação) — estão todos nomeados na{" "}
            <Link href="/legal/privacidade#partilha">Política de Privacidade</Link>. Nunca vendemos
            dados nem os partilhamos com concorrentes.
          </p>
        ),
      },
      {
        q: "Posso apagar a minha conta e os meus dados?",
        a: (
          <p>
            Sim — é um direito teu pelo RGPD. Escreve para{" "}
            <a
              href={`mailto:${EMPRESA.emailPrivacidade}`}
              className="text-amber underline underline-offset-2"
            >
              {EMPRESA.emailPrivacidade}
            </a>{" "}
            e respondemos no prazo de um mês.
          </p>
        ),
      },
      {
        q: "Posso pôr a minha equipa na conta?",
        a: (
          <p>
            Ainda estamos a fechar os detalhes desta funcionalidade. Se precisas disto já, diz-nos e
            tratamos à mão.
          </p>
        ),
      },
    ],
  },
  {
    id: "importacao",
    titulo: "Importação",
    perguntas: [
      {
        q: "Vocês tratam da legalização e do registo no IMT?",
        a: (
          <p>
            Não. O stand continua responsável por toda a legalização, homologação e registo junto do
            IMT e da Alfândega. O AutoImport só calcula o custo estimado <em>antes</em> dessa
            decisão.
          </p>
        ),
      },
      {
        q: "Vocês vendem os carros ou intermediam a compra?",
        a: (
          <p>
            Não. Não somos parte em nenhum negócio que faças. Mostramos o que compensa; a compra é
            entre ti e o vendedor.
          </p>
        ),
      },
    ],
  },
];

export default function AjudaPage() {
  return (
    <div className="mx-auto w-full max-w-[68ch] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Perguntas frequentes</h1>
      <p className="mt-2 text-ink-soft">
        As perguntas que os stands fazem mesmo — respondidas sem rodeios. Se faltar alguma,{" "}
        <a
          href={`mailto:${EMPRESA.emailGeral}`}
          className="text-amber underline underline-offset-2"
        >
          pergunta
        </a>
        .
      </p>

      <nav aria-label="Categorias" className="mt-6 flex flex-wrap gap-2">
        {CATEGORIAS.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            {c.titulo}
          </a>
        ))}
      </nav>

      {CATEGORIAS.map((c) => (
        <section key={c.id} id={c.id} className="mt-10 scroll-mt-20">
          <h2 className="font-display text-xl font-semibold">{c.titulo}</h2>
          <div className="mt-3 flex flex-col gap-2">
            {c.perguntas.map((p) => (
              <details
                key={p.q}
                className="group rounded-[10px] border border-line px-4 open:bg-surface-2"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                  {p.q}
                  <ChevronDown
                    className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="pb-4 text-[15px] leading-7 text-ink-soft [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-ink">
                  {p.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <aside className="mt-12 rounded-[10px] border border-line bg-surface-2 p-4 text-sm text-ink-soft">
        Isto é ajuda prática, não um contrato. O que vincula está em{" "}
        <Link href="/legal" className="text-amber underline underline-offset-2">
          Legal
        </Link>
        .
      </aside>
    </div>
  );
}
