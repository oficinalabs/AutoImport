// lib/db-target.ts — qual é a base de dados, do lado dos coletores.
//
// GÉMEA de `lib/db-url.ts` (a da app), de propósito: os coletores são um
// programa ESM à parte (tools/collector/package.json tem "type": "module",
// nodenext + verbatimModuleSyntax) e importar um .ts da raiz — que o Node
// classifica como CommonJS — não compila nem corre limpo. São ~20 linhas sem
// dependências; se mexeres numa regra, mexe nas DUAS.
//
// Regras (iguais às de lib/db-url.ts):
//   WAREHOUSE_URL  corpus, Postgres LOCAL. Não-local ⇒ lança, não liga.
//   DATABASE_URL   base da app (Supabase). Fallback quando não há warehouse.
//   escrever numa base não-local exige DB_TARGET=prod, comando a comando.

function isLocal(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Warehouse quando existe, senão a base da app. `''` se não houver nenhuma. */
export function dbUrl(): string {
  const warehouse = process.env.WAREHOUSE_URL?.trim();
  if (warehouse && !isLocal(warehouse)) {
    throw new Error(
      'WAREHOUSE_URL não aponta para a máquina local (localhost/127.0.0.1). O warehouse é o ' +
        'corpus completo e só vive numa Postgres local — a Supabase tem 500 MB e recusa ' +
        'escritas quando enche. Corrige a WAREHOUSE_URL (ver .env.example) ou remove-a.',
    );
  }
  return warehouse || process.env.DATABASE_URL || '';
}

/** Recusa escrever numa base não-local sem confirmação explícita. */
export function assertWritable(url: string): void {
  if (isLocal(url) || process.env.DB_TARGET === 'prod') return;
  throw new Error(
    'Recusado: o coletor ESCREVE e a base de dados alvo não é local.\n' +
      'O corpus vive no warehouse — define WAREHOUSE_URL para a Postgres local (ver\n' +
      '.env.example), ou corre com --ndjson para escrever só em disco.\n' +
      'Se é mesmo para escrever na base de PRODUÇÃO, confirma-o à frente do comando:\n' +
      '    DB_TARGET=prod pnpm <comando>\n' +
      '(a connection string não é impressa de propósito)',
  );
}
