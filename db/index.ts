import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Postgres alojada no Supabase (ver docs/04). `prepare: false` é necessário
// para o pooler transaction-mode do Supabase. Sem DATABASE_URL o cliente é
// criado mas só liga no primeiro query (não quebra o build).
const connectionString = process.env.DATABASE_URL ?? "";

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
