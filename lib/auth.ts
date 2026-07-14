import { db } from "@/db";
import * as schema from "@/db/schema";
import { ResetPasswordEmail } from "@/emails/reset-password";
import { sendEmail } from "@/lib/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

/**
 * Configuração do servidor Better Auth.
 * - Postgres (Supabase) via adapter Drizzle.
 * - Login por email + password (ver docs/03).
 * - Multi-tenant: cada **stand** é uma organização (plugin organization),
 *   com papéis owner/member. Ver docs/03 e docs/04.
 * - nextCookies() tem de ser o ÚLTIMO plugin (trata dos cookies nas Server Actions).
 */
export const auth = betterAuth({
  appName: "AutoImport",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hora (o email diz o mesmo)
    sendResetPassword: async ({ user, url }) => {
      // Em dev sem RESEND_API_KEY, o sendEmail avisa e o link fica no log abaixo.
      if (!process.env.RESEND_API_KEY) {
        console.info(`[auth] link de reset para ${user.email}: ${url}`);
      }
      await sendEmail({
        to: user.email,
        subject: "Define uma nova password no AutoImport",
        react: ResetPasswordEmail({ url, name: user.name }),
        text: `Define uma nova password no AutoImport: ${url}\n\nO link é válido durante 1 hora. Se não foste tu que pediste, ignora este email.`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [organization(), nextCookies()],
});
