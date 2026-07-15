import { LegalDoc, type Seccao } from "@/components/legal-doc";
import { DOCS, EMPRESA } from "@/lib/legal";
import type { Metadata } from "next";
import Link from "next/link";

const doc = DOCS.cookies;

export const metadata: Metadata = {
  title: `${doc.titulo} — AutoImport`,
  description: doc.descricao,
};

const SECCOES: Seccao[] = [
  {
    id: "quais",
    titulo: "Que cookies usamos",
    corpo: (
      <>
        <p>Um. Só um:</p>
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold text-ink">Cookie</th>
                <th className="py-2 pr-3 font-semibold text-ink">Para quê</th>
                <th className="py-2 font-semibold text-ink">Duração</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line align-top">
                <td className="py-2 pr-3 text-ink-soft">Cookie de sessão</td>
                <td className="py-2 pr-3 text-ink-soft">
                  Manter-te com sessão iniciada entre páginas. Sem ele, terias de escrever a
                  password a cada clique.
                </td>
                <td className="py-2 text-ink-soft">Até terminares sessão ou expirar</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Não</strong> usamos cookies de publicidade, de redes sociais, nem de análise de
          comportamento. Não há rastreio.
        </p>
      </>
    ),
  },
  {
    id: "consentimento",
    titulo: "Porque não te aparece um banner de cookies",
    corpo: (
      <>
        <p>
          Porque não é preciso. A lei portuguesa (artigo 5.º/2 da Lei 41/2004) dispensa
          consentimento para cookies <strong>estritamente necessários</strong> para prestar um
          serviço que o utilizador pediu — e um cookie de sessão, num sítio onde tens de iniciar
          sessão, é exatamente isso.
        </p>
        <p>
          Estar dispensado de <em>pedir consentimento</em> não dispensa de <em>informar</em>. É para
          isso que serve esta página.
        </p>
        <p>
          Um banner que pergunta “aceitas cookies?” quando só existe um cookie essencial não protege
          ninguém — só treina as pessoas a carregar em “aceitar” sem ler.
        </p>
      </>
    ),
  },
  {
    id: "futuro",
    titulo: "Se um dia isto mudar",
    corpo: (
      <p>
        Se adicionarmos análise de tráfego, publicidade ou qualquer coisa que não seja estritamente
        necessária, <strong>passa a haver banner</strong> — com escolha real, e com o serviço a
        funcionar na mesma se recusares. Atualizamos esta página e a data no topo antes de isso
        acontecer.
      </p>
    ),
  },
  {
    id: "gerir",
    titulo: "Apagar cookies",
    corpo: (
      <>
        <p>
          Podes apagá-los nas definições do teu navegador. Se apagares o cookie de sessão, é como
          terminar sessão — tens de entrar outra vez.
        </p>
        <p>
          Dúvidas: <a href={`mailto:${EMPRESA.emailPrivacidade}`}>{EMPRESA.emailPrivacidade}</a>.
          Ver também a <Link href="/legal/privacidade">Política de Privacidade</Link>.
        </p>
      </>
    ),
  },
];

export default function CookiesPage() {
  return <LegalDoc doc={doc} seccoes={SECCOES} />;
}
