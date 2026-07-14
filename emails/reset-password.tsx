import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Email de recuperação de password.
 * Paleta e tom alinhados com docs/01-DESIGN.md (petróleo + âmbar).
 * Nota: em email não há tokens CSS nem dark mode — as cores vão em hex.
 */
export function ResetPasswordEmail({ url, name }: { url: string; name?: string }) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>Define uma nova password no AutoImport</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={wordmark}>
            <span style={{ fontWeight: 500 }}>Auto</span>Import
          </Text>

          <Section style={card}>
            <Heading style={h1}>Nova password</Heading>
            <Text style={text}>
              {name ? `Olá ${name},` : "Olá,"} recebemos um pedido para definir uma nova password na
              tua conta AutoImport.
            </Text>

            <Button href={url} style={button}>
              Definir nova password
            </Button>

            <Text style={muted}>O link é válido durante 1 hora e só pode ser usado uma vez.</Text>
            <Text style={muted}>
              Se não foste tu que pediste, ignora este email — a tua password fica como está.
            </Text>

            <Text style={{ ...muted, marginTop: "24px" }}>
              Se o botão não funcionar, copia este endereço:
              <br />
              <Link href={url} style={link}>
                {url}
              </Link>
            </Text>
          </Section>

          <Text style={footer}>AutoImport — importa com contas.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ResetPasswordEmail;

const body = {
  backgroundColor: "#f3f5f5",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "24px 0",
};

const container = { margin: "0 auto", maxWidth: "480px", padding: "0 16px" };

const wordmark = {
  color: "#0e3b4a",
  fontSize: "20px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  margin: "0 0 16px",
};

const card = {
  backgroundColor: "#ffffff",
  border: "1px solid #dbe2e3",
  borderRadius: "12px",
  padding: "28px 24px",
};

const h1 = { color: "#0d1c22", fontSize: "22px", fontWeight: 700, margin: "0 0 12px" };

const text = { color: "#0d1c22", fontSize: "15px", lineHeight: "24px", margin: "0 0 20px" };

const button = {
  backgroundColor: "#e8930c",
  borderRadius: "6px",
  color: "#241500",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 700,
  padding: "12px 20px",
  textDecoration: "none",
};

const muted = { color: "#5b6b71", fontSize: "13px", lineHeight: "20px", margin: "16px 0 0" };

const link = { color: "#0e3b4a", fontSize: "12px", wordBreak: "break-all" as const };

const footer = {
  color: "#5b6b71",
  fontSize: "12px",
  margin: "20px 0 0",
  textAlign: "center" as const,
};
