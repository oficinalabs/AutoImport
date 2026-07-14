import { db } from "@/db";
import * as schema from "@/db/schema";
import { ResetPasswordEmail } from "@/emails/reset-password";
import { VerifyEmail } from "@/emails/verify-email";
import { sendEmail } from "@/lib/email";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, checkPassword } from "@/lib/password";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

/** Só ativamos o Google se as credenciais existirem (ver docs/06). */
const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Gera um slug único para a organização do stand. */
function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
  return `${base || "stand"}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Configuração do servidor Better Auth.
 * - Postgres (Supabase) via adapter Drizzle.
 * - Email + password com verificação de email obrigatória (docs/03).
 * - Multi-tenant: cada **stand** é uma organização, criada no servidor
 *   no momento do registo (atómico, sem depender do cliente).
 * - nextCookies() tem de ser o ÚLTIMO plugin.
 */
export const auth = betterAuth({
  appName: "AutoImport",
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    // Sem email verificado não há login (evita contas com emails de terceiros).
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hora
    sendResetPassword: async ({ user, url }) => {
      if (!process.env.RESEND_API_KEY) {
        console.info(`[auth] link de reset para ${user.email}: ${url}`);
      }
      await sendEmail({
        to: user.email,
        subject: "Redefinir a password da sua conta AutoImport",
        react: ResetPasswordEmail({ url, name: user.name }),
        text: `Pediu para redefinir a password da sua conta AutoImport.\n\nAbra este endereço para escolher uma nova password: ${url}\n\nO link expira dentro de 1 hora e só pode ser usado uma vez. Se não foi o utilizador que pediu, ignore este email — a password atual mantém-se.`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 horas
    sendVerificationEmail: async ({ user, url }) => {
      if (!process.env.RESEND_API_KEY) {
        console.info(`[auth] link de verificação para ${user.email}: ${url}`);
      }
      await sendEmail({
        to: user.email,
        subject: "Confirme o seu email para ativar a conta AutoImport",
        react: VerifyEmail({ url, name: user.name }),
        text: `Bem-vindo ao AutoImport.\n\nConfirme o seu email para ativar a conta: ${url}\n\nO link expira dentro de 24 horas. Se não criou nenhuma conta, ignore este email.`,
      });
    },
  },

  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : undefined,

  user: {
    additionalFields: {
      // Nome do stand recolhido no registo; usado para criar a organização.
      standName: { type: "string", required: false, input: true },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Cria o stand (organização) + membership de owner no servidor,
        // logo a seguir ao utilizador. Não depende de haver sessão.
        after: async (user) => {
          const name = (user as { standName?: string }).standName?.trim() || user.name || "Stand";
          try {
            const [org] = await db
              .insert(schema.organization)
              .values({
                id: crypto.randomUUID(),
                name,
                slug: slugify(name),
                createdAt: new Date(),
              })
              .returning();

            await db.insert(schema.member).values({
              id: crypto.randomUUID(),
              organizationId: org.id,
              userId: user.id,
              role: "owner",
              createdAt: new Date(),
            });
          } catch (error) {
            // Não rebentamos o registo por causa disto — mas queremos saber.
            console.error("[auth] falha ao criar organização do stand:", error);
          }
        },
      },
    },
  },

  hooks: {
    // Regras de password impostas no SERVIDOR (a UI é só conveniência).
    before: createAuthMiddleware(async (ctx) => {
      const isSignUp = ctx.path === "/sign-up/email";
      const isReset = ctx.path === "/reset-password";
      if (!isSignUp && !isReset) return;

      const body = ctx.body as { password?: string; newPassword?: string } | undefined;
      const password = isSignUp ? body?.password : body?.newPassword;
      if (!password) return;

      const result = checkPassword(password);
      if (!result.valid) {
        throw new APIError("BAD_REQUEST", {
          code: "WEAK_PASSWORD",
          message: result.message ?? "A password não cumpre os requisitos de segurança.",
        });
      }
    }),
  },

  // Trava tentativas repetidas (brute force / enumeração).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 10, max: 3 },
      "/request-password-reset": { window: 60 * 10, max: 3 },
      "/reset-password": { window: 60 * 10, max: 5 },
      "/send-verification-email": { window: 60 * 10, max: 3 },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    updateAge: 60 * 60 * 24, // renova a sessão no máximo 1x/dia
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    freshAge: 60 * 60 * 24, // operações sensíveis exigem sessão recente
  },

  advanced: {
    // Cookies endurecidos (em produção o Better Auth já usa Secure + __Secure-).
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
    },
    useSecureCookies: process.env.NODE_ENV === "production",
  },

  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],

  plugins: [organization(), nextCookies()],
});
