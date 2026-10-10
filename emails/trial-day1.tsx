/** @jsxRuntime automatic */
// ↑ Para o JSX funcionar também fora do Next: o tsx/esbuild, com o "jsx":
// "preserve" do tsconfig, compila para React.createElement sem React em escopo
// ("React is not defined"). Com o pragma, o `pnpm test` renderiza o email sem
// precisar do TSX_TSCONFIG_PATH. Ver o aviso em scripts/pipeline/match-alerts.ts.
import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, text } from "./layout";

/**
 * Trial, dia 1 (scripts/pipeline/trial-emails.ts): boas-vindas e os três
 * passos que fazem o stand tirar proveito do mês grátis.
 *
 * Assunto sugerido: "Bem-vindo ao AutoImport: por onde começar"
 */
export function TrialDay1Email({
  name,
  appUrl,
  trialEnds,
}: {
  name?: string;
  /** base da app, sem barra no fim */
  appUrl: string;
  /** fim do trial, já formatado (ex.: "9 de novembro") */
  trialEnds: string;
}) {
  return (
    <EmailLayout preview="Três passos para encontrares o primeiro carro que compensa importar.">
      <Text style={h1}>Bem-vindo ao AutoImport</Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} o teu stand tem acesso completo até{" "}
        <strong>{trialEnds}</strong>, sem cartão. Três passos para tirares proveito disto:
      </Text>
      <Text style={text}>
        <strong>1. Pesquisa.</strong> Filtra por marca, modelo e país. Cada anúncio já mostra o
        custo final em Portugal: compra, transporte, ISV, IUC e legalização.
        <br />
        <strong>2. Abre a ficha.</strong> Vês a conta linha a linha e o preço a que carros parecidos
        estão à venda cá.
        <br />
        <strong>3. Cria um alerta.</strong> Escolhe os modelos que costumas vender e recebes um
        resumo por email quando aparecer um que compense.
      </Text>

      <Button href={`${appUrl}/pesquisar`} style={button}>
        Começar a pesquisar
      </Button>

      <Text style={muted}>
        Dúvidas sobre as contas? A{" "}
        <Link href={`${appUrl}/ajuda`} style={linkStyle}>
          página de ajuda
        </Link>{" "}
        explica de onde vem cada número.
      </Text>
    </EmailLayout>
  );
}
