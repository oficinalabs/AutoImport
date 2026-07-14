// watch-custojusto.ts — CLI da recolha CONTÍNUA do CustoJusto.pt (poll da listagem base).
//
// Uso:
//   node watch-custojusto.ts                     # 1 em 1 min, contínuo
//   node watch-custojusto.ts --interval 60
//   node watch-custojusto.ts --interval 12 --cycles 2   # teste
//
// ⚠️ SEM paginação (`?o=N` robots-proibido): cada ciclo lê a 1ª página da listagem base (40 mais
// recentes, ordenados por data). Não há flag --pages (não paginamos). Ver custojusto/watch.ts.
//
// Flags: --interval <seg> (default 60), --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './custojusto/http.ts';
import { watch } from './custojusto/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
