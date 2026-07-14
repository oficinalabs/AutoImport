// watch-olxpt.ts — CLI da recolha CONTÍNUA do olx.pt (poll por recência: created_at:desc).
//
// Uso:
//   node watch-olxpt.ts                          # 1 em 1 min, contínuo
//   node watch-olxpt.ts --interval 60 --pages 2
//   node watch-olxpt.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo × 52, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './olxpt/http.ts';
import { watch } from './olxpt/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
