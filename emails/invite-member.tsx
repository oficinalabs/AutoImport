import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/**
 * Convite para a equipa de um stand (enviado quando o dono convida em /stand).
 * Assunto: "Convite para a equipa do <stand> no AutoImport"
 */
export function InviteMemberEmail({
  url,
  standName,
  inviterName,
}: {
  url: string;
  standName: string;
  inviterName: string;
}) {
  return (
    <EmailLayout preview={`${inviterName} convidou-o para a equipa do ${standName}.`}>
      <Text style={h1}>Convite para a equipa</Text>
      <Text style={text}>
        <strong>{inviterName}</strong> convidou-o para a equipa do <strong>{standName}</strong> no
        AutoImport — a ferramenta que mostra que carros compensa importar, já com o ISV contado.
      </Text>
      <Text style={text}>Não há nada a pagar: a subscrição é do stand e cobre toda a equipa.</Text>

      <Button href={url} style={button}>
        Aceitar convite
      </Button>

      <Text style={notice}>
        O link expira dentro de 7 dias. Só pode ser aceite com uma conta neste endereço de email.
      </Text>

      <Text style={muted}>
        Se não esperava este convite, ignore este email — não fica a fazer parte de nada.
      </Text>

      <Text style={{ ...muted, marginTop: "20px" }}>
        Se o botão não funcionar, copie este endereço para o navegador:
        <br />
        <Link href={url} style={linkStyle}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export default InviteMemberEmail;
