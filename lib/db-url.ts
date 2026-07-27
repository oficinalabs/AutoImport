/**
 * Qual é a base de dados — e a guarda que impede escrever na errada.
 *
 * São DUAS, desde que o corpus deixou de caber na Supabase:
 *
 * - `WAREHOUSE_URL` — o **corpus** (centenas de milhares de anúncios) numa
 *   Postgres **local**. É o que os coletores e o pipeline lêem e escrevem.
 *   Se estiver definida e não apontar para a máquina local, nada liga: falha
 *   fechada. O corpus na Supabase enche os 500 MB e a base recusa escritas.
 * - `DATABASE_URL` — a base que **serve a app** (Supabase em produção): a
 *   montra publicada + os dados de utilizador (auth, stands, favoritos,
 *   alertas). Na Vercel é a única que existe.
 *
 * Inversão do default: sem `WAREHOUSE_URL` nada muda (Vercel e CI continuam
 * exatamente como antes); com ela, tudo o que passa por `db/index.ts` fala com
 * o warehouse. Escrever na Supabase passa a ser um ato explícito — publicador
 * dedicado + `DB_TARGET=prod`.
 *
 * Nenhuma mensagem daqui imprime a connection string, nem parcialmente.
 *
 * ⚠️ Os coletores (`tools/collector/`) são um programa ESM à parte e não
 * importam código da app — têm a gémea `tools/collector/lib/db-target.ts`, com
 * as MESMAS regras. Mexer aqui ⇒ mexer lá.
 */

/** true se a URL apontar para a Postgres da própria máquina. Ilegível → false. */
export function isLocalDbUrl(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * URL do warehouse (corpus). `""` quando `WAREHOUSE_URL` não está definida.
 * Definida e não-local → lança, sem ligar a nada.
 */
export function warehouseUrl(): string {
  const url = process.env.WAREHOUSE_URL?.trim();
  if (!url) return "";
  if (!isLocalDbUrl(url)) {
    throw new Error(
      "WAREHOUSE_URL não aponta para a máquina local (localhost/127.0.0.1). O warehouse é o " +
        "corpus completo e só vive numa Postgres local — a Supabase tem 500 MB e recusa " +
        "escritas quando enche. Corrige a WAREHOUSE_URL (ver .env.example) ou remove-a.",
    );
  }
  return url;
}

/**
 * URL da base que serve a app (Supabase em produção). `""` quando não definida.
 * É o destino da publicação: quem publica abre as DUAS ligações — `dbUrl()`
 * (corpus, origem) e esta (destino) — e passa esta por `assertWritable`.
 * Como o `process.loadEnvFile` não sobrepõe o que já está definido, carregar o
 * `.env.production.local` ANTES do `.env.local` é o que põe aqui a Supabase.
 */
export function appDbUrl(): string {
  return process.env.DATABASE_URL ?? "";
}

/**
 * A base com que o código fala por omissão: o warehouse quando existe, senão a
 * da app. Na Vercel e no CI não há `WAREHOUSE_URL` — logo, o de sempre.
 */
export function dbUrl(): string {
  return warehouseUrl() || appDbUrl();
}

/**
 * Guarda de escrita para scripts de CLI. Deixa passar a base local, a Vercel
 * (onde o build corre contra a base da app, e é suposto) e a confirmação
 * explícita `DB_TARGET=prod`. Tudo o resto é recusado antes de abrir ligação.
 */
export function assertWritable(url: string): void {
  if (!url) {
    throw new Error(
      "Sem base de dados: define WAREHOUSE_URL (corpus, Postgres local) ou DATABASE_URL " +
        "no .env.local — ver .env.example.",
    );
  }
  if (isLocalDbUrl(url)) return;
  if (process.env.VERCEL) return;
  if (process.env.DB_TARGET === "prod") return;
  throw new Error(
    [
      "Recusado: este comando ESCREVE e a base de dados alvo não é local.",
      "O corpus vive no warehouse — define WAREHOUSE_URL para a Postgres local (ver",
      ".env.example) e volta a correr.",
      "Se é mesmo para escrever na base de PRODUÇÃO, confirma-o à frente do comando:",
      "    DB_TARGET=prod pnpm <comando>",
      "(a connection string não é impressa de propósito)",
    ].join("\n"),
  );
}
