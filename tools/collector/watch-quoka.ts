// watch-quoka.ts — CLI da recolha CONTÍNUA do quoka.de (poll de recentes, sort=date).
//
// Uso:
//   node watch-quoka.ts                     # 1 em 1 min, contínuo
//   node watch-quoka.ts --interval 60 --pages 2
//   node watch-quoka.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas de recentes/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './quoka/http.ts';
import { watch } from './quoka/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
