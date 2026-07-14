import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/**
 * Email de confirmação de conta (enviado no registo).
 * Assunto: "Confirme o seu email para ativar a conta AutoImport"
 */
export function VerifyEmail({ url, name }: { url: string; name?: string }) {
  return (
    <EmailLayout preview="Falta um passo para ativar a conta do seu stand.">
      <Text style={h1}>Confirme o seu email</Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} obrigado por registar o seu stand no AutoImport. Confirme o
        seu email para ativar a conta e começar a ver que carros compensa importar.
      </Text>

      <Button href={url} style={button}>
        Confirmar email
      </Button>

      <Text style={notice}>O link expira dentro de 24 horas e só pode ser usado uma vez.</Text>

      <Text style={muted}>
        Se não foi o utilizador que criou esta conta, ignore este email — não será criado nada em
        seu nome.
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

export default VerifyEmail;
