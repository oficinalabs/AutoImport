import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Casca partilhada dos emails transacionais.
 *
 * Segue docs/01-DESIGN.md (petróleo + âmbar, hierarquia sóbria), com as
 * limitações do email em mente: sem tokens CSS, sem dark mode fiável,
 * estilos inline e uma só coluna.
 *
 * O `preview` é o texto que aparece na lista de emails a seguir ao assunto
 * — trata-se como copy de produto, não como sobra do corpo.
 */
export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Cabeçalho petróleo — a marca, sem ruído */}
          <Section style={header}>
            <Text style={wordmark}>
              <span style={{ fontWeight: 400 }}>Auto</span>Import
            </Text>
          </Section>

          <Section style={card}>{children}</Section>

          <Hr style={hr} />
          <Text style={footer}>
            AutoImport — que carros compensa importar, já com ISV.
            <br />
            <Link href="https://autoimport.arestadigital.pt" style={footerLink}>
              autoimport.arestadigital.pt
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/* ── Estilos partilhados ────────────────────────────────── */

export const h1 = {
  color: "#0d1c22",
  fontSize: "20px",
  fontWeight: 700,
  letterSpacing: "-0.01em",
  margin: "0 0 12px",
};

export const text = {
  color: "#0d1c22",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

export const button = {
  backgroundColor: "#e8930c",
  borderRadius: "6px",
  color: "#241500",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 700,
  padding: "12px 22px",
  textDecoration: "none",
};

export const muted = {
  color: "#5b6b71",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "16px 0 0",
};

export const linkStyle = {
  color: "#0e3b4a",
  fontSize: "12px",
  wordBreak: "break-all" as const,
};

/** Caixa de aviso discreta (ex.: expiração do link). */
export const notice = {
  backgroundColor: "#f3f5f5",
  borderLeft: "3px solid #3e6b79",
  borderRadius: "4px",
  color: "#5b6b71",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "20px 0 0",
  padding: "10px 12px",
};

const body = {
  backgroundColor: "#eef1f0",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const container = { margin: "0 auto", maxWidth: "480px", padding: "0 16px" };

const header = {
  backgroundColor: "#0e3b4a",
  borderRadius: "10px 10px 0 0",
  padding: "16px 24px",
};

const wordmark = {
  color: "#ffffff",
  fontSize: "18px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  margin: 0,
};

const card = {
  backgroundColor: "#ffffff",
  border: "1px solid #dbe2e3",
  borderRadius: "0 0 10px 10px",
  borderTop: "none",
  padding: "28px 24px",
};

const hr = { borderColor: "#dbe2e3", margin: "20px 0 12px" };

const footer = {
  color: "#5b6b71",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
  textAlign: "center" as const,
};

const footerLink = { color: "#5b6b71", fontSize: "12px" };
