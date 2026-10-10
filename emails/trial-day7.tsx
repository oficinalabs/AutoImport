/** @jsxRuntime automatic */
// ↑ Para o JSX funcionar também fora do Next: o tsx/esbuild, com o "jsx":
// "preserve" do tsconfig, compila para React.createElement sem React em escopo
// ("React is not defined"). Com o pragma, o `pnpm test` renderiza o email sem
// precisar do TSX_TSCONFIG_PATH. Ver o aviso em scripts/pipeline/match-alerts.ts.
import { Button, Text } from "@react-email/components";
import { EmailLayout, button, h1, muted, text } from "./layout";

/**
 * Trial, dia 7 (scripts/pipeline/trial-emails.ts): uma semana depois, o
 * empurrão para o hábito que segura o stand: ter alertas ativos.
 *
 * Assunto sugerido: "Uma semana de AutoImport: já tens alertas?"
 */
export function TrialDay7Email({
  name,
  appUrl,
  alertCount,
}: {
  name?: string;
  appUrl: string;
  /** alertas ativos do stand neste momento */
  alertCount: number;
}) {
  return (
    <EmailLayout preview="Os alertas trabalham por ti: um resumo por dia com os carros que compensam.">
      <Text style={h1}>Uma semana de AutoImport</Text>
      {alertCount === 0 ? (
        <Text style={text}>
          {name ? `Olá ${name},` : "Olá,"} o teu stand ainda não tem alertas. É a forma mais rápida
          de não perder um carro: escolhes os modelos que vendes e, quando aparecer um que compense
          importar, recebes um resumo por email nessa manhã.
        </Text>
      ) : (
        <Text style={text}>
          {name ? `Olá ${name},` : "Olá,"} o teu stand tem{" "}
          <strong>
            {alertCount} {alertCount === 1 ? "alerta ativo" : "alertas ativos"}
          </strong>
          . Quando aparecer um carro que encaixe, recebes um resumo por email nessa manhã. Vale a
          pena juntar os outros modelos que costumas vender.
        </Text>
      )}

      <Button href={`${appUrl}/alertas`} style={button}>
        {alertCount === 0 ? "Criar o primeiro alerta" : "Ver os meus alertas"}
      </Button>

      <Text style={muted}>
        Dica: na ficha de um anúncio, o botão de alerta cria um com a marca e o modelo já
        preenchidos.
      </Text>
    </EmailLayout>
  );
}
