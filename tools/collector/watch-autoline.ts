// watch-autoline.ts — CLI da recolha CONTÍNUA do autoline.pt (poll da ordem default do país).
//
// Uso:
//   node watch-autoline.ts                              # 1 em 1 min, contínuo (carros BE)
//   node watch-autoline.ts --country DE --interval 60 --pages 2
//   node watch-autoline.ts --interval 12 --cycles 2     # teste
//
// Flags: --country <CC> (default BE), --pages <n> (páginas/ciclo, default 1),
//        --interval <seg> (default 60), --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoline/http.ts';
import { watch } from './autoline/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
  buildConfig: (args) => ({
    country: args.country ? String(args.country).toUpperCase() : 'BE',
  }),
});
