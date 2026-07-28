import { defineConfig } from "drizzle-kit";
import { assertWritable, dbUrl } from "./lib/db-url";

// O drizzle-kit (ao contrário do Next) não carrega o .env.local sozinho.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local (ex.: CI) — as variáveis vêm do ambiente.
}

// Warehouse quando existe, senão a base da app (ver lib/db-url.ts).
const url = dbUrl();
// `generate` só lê o schema — não liga a nada. Tudo o resto (migrate, push,
// studio) toca na base de dados: passa pela guarda anti-produção.
if (process.argv[2] !== "generate") assertWritable(url);

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  // Só olhar para o nosso schema. Sem isto, o drizzle-kit tenta introspecionar
  // os schemas internos do Supabase (auth, storage, realtime…), onde não temos
  // permissão para ler as definições dos constraints — e rebenta.
  schemaFilter: ["public"],
  extensionsFilters: ["postgis"],
});
