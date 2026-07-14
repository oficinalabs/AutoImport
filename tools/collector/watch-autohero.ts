// watch-autohero.ts — CLI da recolha CONTÍNUA do autohero.com (poll por recência).
//
// Uso:
//   node watch-autohero.ts                          # 1 em 1 min, contínuo
//   node watch-autohero.ts --interval 60 --pages 2
//   node watch-autohero.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo × 100, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autohero/http.ts';
import { watch } from './autohero/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
