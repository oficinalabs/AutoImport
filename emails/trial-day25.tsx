/** @jsxRuntime automatic */
// ↑ Para o JSX funcionar também fora do Next: o tsx/esbuild, com o "jsx":
// "preserve" do tsconfig, compila para React.createElement sem React em escopo
// ("React is not defined"). Com o pragma, o `pnpm test` renderiza o email sem
// precisar do TSX_TSCONFIG_PATH. Ver o aviso em scripts/pipeline/match-alerts.ts.
import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/**
 * Trial, dia 25 (scripts/pipeline/trial-emails.ts): o aviso de que o mês
 * grátis está a acabar, com o caminho para subscrever.
 *
 * Assunto sugerido: "O teu mês grátis acaba a {data}"
 */
export function TrialDay25Email({
  name,
  trialEnds,
  price,
  manageUrl,
  termsUrl,
}: {
  name?: string;
  /** fim do trial, já formatado (ex.: "9 de novembro") */
  trialEnds: string;
  /** preço mensal, já formatado (ex.: "100 €") */
  price: string;
  /** onde o dono do stand subscreve e gere a subscrição */
  manageUrl: string;
  termsUrl: string;
}) {
  return (
    <EmailLayout preview={`O acesso do teu stand mantém-se por ${price}/mês + IVA.`}>
      <Text style={h1}>O teu mês grátis acaba a {trialEnds}</Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} faltam poucos dias para o fim do período experimental. Para
        o stand continuar com a pesquisa, as fichas e os alertas, basta subscrever:{" "}
        <strong>{price} por mês + IVA</strong>, para toda a equipa.
      </Text>

      <Button href={manageUrl} style={button}>
        Gerir subscrição
      </Button>

      <Text style={notice}>
        Se não subscreveres, o acesso fecha a {trialEnds}. Os teus alertas e favoritos ficam
        guardados e voltam assim que subscreveres.
      </Text>

      <Text style={muted}>
        As condições estão nos{" "}
        <Link href={termsUrl} style={linkStyle}>
          termos da subscrição
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}
