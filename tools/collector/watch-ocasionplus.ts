// watch-ocasionplus.ts — CLI da recolha CONTÍNUA do ocasionplus.com (poll da ordem default).
//
// Uso:
//   node watch-ocasionplus.ts                          # 1 em 1 min, contínuo
//   node watch-ocasionplus.ts --interval 60 --pages 2
//   node watch-ocasionplus.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './ocasionplus/http.ts';
import { watch } from './ocasionplus/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
