/** @jsxRuntime automatic */
// ↑ Para o JSX funcionar também fora do Next: o tsx/esbuild, com o "jsx":
// "preserve" do tsconfig, compila para React.createElement sem React em escopo
// ("React is not defined"). Com o pragma, o `pnpm test` renderiza o email sem
// precisar do TSX_TSCONFIG_PATH. Ver o aviso em scripts/pipeline/match-alerts.ts.
import { Button, Link, Section, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/** Uma linha do resumo: um carro novo que encaixa num alerta do stand. */
export interface DigestItem {
  /** marca modelo ano */
  title: string;
  /** país de origem, ex.: "Alemanha" */
  country: string;
  /** nome do alerta que o apanhou */
  alertName: string;
  /** custo final estimado em PT, já formatado (ex.: "24 350 €") */
  totalPt: string;
  /** ex.: "margem estimada 2 100 €" ou "poupa cerca de 3 000 €", já pronto a mostrar */
  highlight: string;
  /** URL absoluto do anúncio */
  url: string;
}

/**
 * Resumo diário dos alertas (scripts/pipeline/match-alerts.ts): UM email por
 * stand com todos os carros novos do dia, em vez de um email por carro. O sino
 * da topbar continua a ter um evento por carro.
 *
 * Assunto sugerido: "3 carros novos para os teus alertas"
 */
export function DigestEmail({
  name,
  items,
  moreCount,
  alertsUrl,
}: {
  name?: string;
  /** os carros a mostrar (já cortados ao máximo do email) */
  items: DigestItem[];
  /** quantos ficaram de fora do email por excesso; vê-se tudo no sino */
  moreCount: number;
  alertsUrl: string;
}) {
  const total = items.length + moreCount;
  const frase = total === 1 ? "1 carro novo" : `${total} carros novos`;
  return (
    <EmailLayout preview={`${frase} para os teus alertas, já com o custo final em Portugal.`}>
      <Text style={h1}>
        {total === 1 ? "Há 1 carro novo" : `Há ${total} carros novos`} para os teus alertas
      </Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} desde o último resumo apareceu{total === 1 ? "" : "ram"}{" "}
        {frase} que encaixa{total === 1 ? "" : "m"} nos alertas do teu stand:
      </Text>

      {items.map((item) => (
        <Section key={item.url} style={row}>
          <Text style={{ ...text, margin: "0 0 2px" }}>
            <Link href={item.url} style={titleLink}>
              {item.title}
            </Link>{" "}
            · {item.country}
          </Text>
          <Text style={{ ...muted, margin: 0 }}>
            Custo final em PT <strong>{item.totalPt}</strong> · {item.highlight} · alerta “
            {item.alertName}”
          </Text>
        </Section>
      ))}

      {moreCount > 0 && (
        <Text style={text}>E mais {moreCount} — estão todos no sino da aplicação.</Text>
      )}

      <Button href={alertsUrl} style={{ ...button, marginTop: "8px" }}>
        Ver os meus alertas
      </Button>

      <Text style={notice}>
        Os valores são estimativas (ISV/IUC podem mudar, o anúncio pode já ter sido vendido).
        Confirma sempre antes de fechar negócio.
      </Text>

      <Text style={muted}>
        Recebes este resumo, no máximo uma vez por dia, porque tens alertas ativos no AutoImport.
        Podes geri-los ou desligá-los em{" "}
        <Link href={alertsUrl} style={linkStyle}>
          Alertas
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

const row = {
  borderBottom: "1px solid #dbe2e3",
  marginBottom: "12px",
  paddingBottom: "12px",
};

const titleLink = { color: "#0e3b4a", fontWeight: 700, textDecoration: "none" };
