import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dbUrl } from "../lib/db-url";
import * as schema from "./schema";

// Warehouse local quando há WAREHOUSE_URL (corpus — coletores e pipeline);
// senão a Postgres da app alojada no Supabase (ver docs/04 e lib/db-url.ts).
// Na Vercel não há WAREHOUSE_URL: é sempre a segunda. `prepare: false` é
// necessário para o pooler transaction-mode do Supabase. Sem nenhuma das duas
// o cliente é criado mas só liga no primeiro query (não quebra o build).
const connectionString = dbUrl();

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

/** Fechar a ligação (scripts/testes — o Next não precisa). */
export async function closeDb() {
  await client.end({ timeout: 5 });
}
