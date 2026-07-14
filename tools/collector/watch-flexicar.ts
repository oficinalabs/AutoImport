// watch-flexicar.ts — CLI da recolha CONTÍNUA do flexicar.es (poll da ordem default).
//
// Uso:
//   node watch-flexicar.ts                          # 1 em 1 min, contínuo
//   node watch-flexicar.ts --interval 60 --pages 2
//   node watch-flexicar.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (facetas/ciclo — base + N-1 marcas, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './flexicar/http.ts';
import { watch } from './flexicar/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
