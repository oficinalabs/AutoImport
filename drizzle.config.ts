import { defineConfig } from "drizzle-kit";

// O drizzle-kit (ao contrário do Next) não carrega o .env.local sozinho.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local (ex.: CI) — as variáveis vêm do ambiente.
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
