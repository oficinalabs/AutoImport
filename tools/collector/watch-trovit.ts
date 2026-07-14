// watch-trovit.ts — CLI da recolha CONTÍNUA do coches.trovit.es (poll com sort por data).
//
// Uso:
//   node watch-trovit.ts                             # slug default (madrid), 1 em 1 min, contínuo
//   node watch-trovit.ts --slug audi --interval 60 --pages 2
//   node watch-trovit.ts --interval 12 --cycles 2     # teste
//
// Flags: --slug <slug> (faceta a vigiar, default madrid), --pages <n> (páginas/ciclo, default 1),
//        --interval <seg> (default 60), --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './trovit/http.ts';
import { watch } from './trovit/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
  buildConfig: (args) => ({
    slug: args.slug ? String(args.slug) : undefined,
  }),
});
