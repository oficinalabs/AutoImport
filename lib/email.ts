import { Resend } from "resend";

/**
 * Envio de email transacional via Resend (ver docs/06-SERVICOS-EXTERNOS.md).
 *
 * Sem RESEND_API_KEY o envio é ignorado com um aviso — a app continua a
 * funcionar em desenvolvimento (o link de reset aparece no log do servidor).
 */
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

/** Remetente. Tem de ser um domínio verificado no Resend. */
const FROM = process.env.EMAIL_FROM ?? "AutoImport <onboarding@resend.dev>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  react: React.ReactElement;
  /** Fallback em texto, para quem tem HTML desligado. */
  text: string;
}

export async function sendEmail({ to, subject, react, text }: SendEmailOptions): Promise<void> {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY em falta — email "${subject}" para ${to} não foi enviado.`,
    );
    return;
  }

  const { error } = await resend.emails.send({ from: FROM, to, subject, react, text });

  if (error) {
    // Não expomos o detalhe ao utilizador (evita enumeração de contas),
    // mas queremos o erro nos logs/Sentry.
    console.error("[email] falha no envio:", error);
    throw new Error(`Falha ao enviar email: ${error.message}`);
  }
}
