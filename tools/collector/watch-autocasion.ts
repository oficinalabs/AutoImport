// watch-autocasion.ts — CLI da recolha CONTÍNUA do autocasion.com (poll da ordem default).
//
// Uso:
//   node watch-autocasion.ts                          # 1 em 1 min, contínuo
//   node watch-autocasion.ts --interval 60 --pages 2
//   node watch-autocasion.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autocasion/http.ts';
import { watch } from './autocasion/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
