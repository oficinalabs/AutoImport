// watch-caetano.ts — CLI da recolha CONTÍNUA da Caetano (poll por recência da API Digital Store).
//
// Uso:
//   node watch-caetano.ts                            # 1 em 1 min, contínuo
//   node watch-caetano.ts --interval 60 --pages 2
//   node watch-caetano.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo × 250, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './caetano/http.ts';
import { watch } from './caetano/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
