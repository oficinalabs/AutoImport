// watch-autosapo.ts — CLI da recolha CONTÍNUA do auto.sapo.pt (poll por recência, orderby=1).
//
// Uso:
//   node watch-autosapo.ts                             # 1 em 1 min, contínuo
//   node watch-autosapo.ts --interval 60 --pages 3
//   node watch-autosapo.ts --interval 12 --cycles 2    # teste
//
// Flags: --pages <n> (páginas/ciclo × 20, default 3), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autosapo/http.ts';
import { watch } from './autosapo/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
  buildConfig: (args) => ({
    pages: Number(args.pages) || 3,
  }),
});
