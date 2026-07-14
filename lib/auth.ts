import { db } from "@/db";
import * as schema from "@/db/schema";
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
    // TODO(email): ligar o envio real via Resend quando a chave existir (docs/06).
    // sendResetPassword: async ({ user, url }) => { ... },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [organization(), nextCookies()],
});
