// watch-carplus.ts — CLI da recolha CONTÍNUA do carplus.pt (poll da ordem default).
//
// Uso:
//   node watch-carplus.ts                             # 1 em 1 min, contínuo
//   node watch-carplus.ts --interval 60 --pages 2
//   node watch-carplus.ts --interval 12 --cycles 2    # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './carplus/http.ts';
import { watch } from './carplus/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
