import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/**
 * Confirmação de troca de email. Vai para o endereço NOVO — é isso que prova
 * que ele existe e que é do utilizador.
 * Assunto: "Confirme o novo email da sua conta AutoImport"
 */
export function ChangeEmailVerification({
  url,
  name,
  newEmail,
}: {
  url: string;
  name?: string;
  newEmail: string;
}) {
  return (
    <EmailLayout preview="Confirme este endereço para passar a usá-lo na sua conta.">
      <Text style={h1}>Confirme o novo email</Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} pediu para passar a usar <strong>{newEmail}</strong> na sua
        conta AutoImport. Confirme que este endereço é seu.
      </Text>

      <Button href={url} style={button}>
        Confirmar novo email
      </Button>

      <Text style={notice}>
        Até confirmar, a conta continua com o email antigo — e é por lá que entra.
      </Text>

      <Text style={muted}>
        Se não foi o utilizador que pediu esta alteração, ignore este email: nada muda. Convém
        também verificar quem tem acesso à sua conta.
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
