// watch-meinauto.ts — CLI da recolha CONTÍNUA do meinauto.de (poll por data de criação).
//
// Uso:
//   node watch-meinauto.ts                          # 1 em 1 min, contínuo
//   node watch-meinauto.ts --interval 60 --pages 2
//   node watch-meinauto.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './meinauto/http.ts';
import { watch } from './meinauto/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
