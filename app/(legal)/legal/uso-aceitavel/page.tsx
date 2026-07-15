import { LegalDoc, type Seccao } from "@/components/legal-doc";
import { DOCS, EMPRESA } from "@/lib/legal";
import type { Metadata } from "next";
import Link from "next/link";

const doc = DOCS["uso-aceitavel"];

export const metadata: Metadata = {
  title: `${doc.titulo} — AutoImport`,
  description: doc.descricao,
};

const SECCOES: Seccao[] = [
  {
    id: "permitido",
    titulo: "Para que podes usar",
    corpo: (
      <>
        <p>
          Para a atividade do teu stand: procurar viaturas que compense importar, avaliar custos,
          comparar com o mercado português e decidir o que comprar.
        </p>
        <p>
          A licença é para o teu stand e para quem lá trabalha. Nada aqui te impede de usar
          normalmente a plataforma no dia a dia.
        </p>
      </>
    ),
  },
  {
    id: "proibido",
    titulo: "O que não podes fazer",
    corpo: (
      <>
        <ul>
          <li>
            <strong>Extrair a plataforma automaticamente</strong> — scraping, crawling, robôs ou
            qualquer recolha sistemática dos dados que mostramos.
          </li>
          <li>
            <strong>Construir uma base de dados derivada</strong> a partir do que aqui vês, ou
            redistribuir/revender os nossos dados a terceiros.
          </li>
          <li>
            <strong>Partilhar a conta fora do stand</strong> — credenciais são de quem as usa.
          </li>
          <li>
            <strong>Fazer engenharia inversa</strong> da plataforma ou dos cálculos.
          </li>
          <li>
            <strong>Tentar aceder a dados de outros stands</strong>, ou contornar limites técnicos e
            de segurança.
          </li>
          <li>
            Usar o serviço para fins ilícitos, ou de forma que prejudique o funcionamento da
            plataforma para os outros.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "consequencias",
    titulo: "O que acontece se não cumprires",
    corpo: (
      <p>
        Consoante a gravidade: avisamos, suspendemos ou encerramos a conta — conforme a secção 11
        dos <Link href="/legal/termos">Termos de Serviço</Link>. Em casos graves (por exemplo,
        extração automatizada em massa), suspendemos primeiro e falamos depois.
      </p>
    ),
  },
  {
    id: "reportar",
    titulo: "Reportar abusos",
    corpo: (
      <p>
        Se vires alguém a usar mal a plataforma, diz-nos:{" "}
        <a href={`mailto:${EMPRESA.emailLegal}`}>{EMPRESA.emailLegal}</a>.
      </p>
    ),
  },
];

export default function UsoAceitavelPage() {
  return <LegalDoc doc={doc} seccoes={SECCOES} />;
}
