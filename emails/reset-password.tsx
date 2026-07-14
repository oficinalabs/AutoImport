import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/**
 * Email de redefinição de password.
 * Assunto: "Redefinir a password da sua conta AutoImport"
 */
export function ResetPasswordEmail({ url, name }: { url: string; name?: string }) {
  return (
    <EmailLayout preview="Link seguro para escolher uma nova password. Expira em 1 hora.">
      <Text style={h1}>Redefinir a password</Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} recebemos um pedido para redefinir a password da sua conta
        AutoImport. Escolha uma nova password no link abaixo.
      </Text>

      <Button href={url} style={button}>
        Escolher nova password
      </Button>

      <Text style={notice}>O link expira dentro de 1 hora e só pode ser usado uma vez.</Text>

      <Text style={muted}>
        Se não foi o utilizador que fez este pedido, ignore este email — a password atual mantém-se
        inalterada e ninguém acede à conta.
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

export default ResetPasswordEmail;
