// watch-santogal.ts — CLI da recolha CONTÍNUA do santogal.pt (poll da ordem default).
//
// Uso:
//   node watch-santogal.ts                              # 1 em 1 min, contínuo
//   node watch-santogal.ts --interval 60 --pages 2
//   node watch-santogal.ts --interval 12 --cycles 2     # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './santogal/http.ts';
import { watch } from './santogal/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
