// watch-standvirtual.ts — CLI da recolha CONTÍNUA do standvirtual.com (poll de recentes).
//
// Uso:
//   node watch-standvirtual.ts                     # 1 em 1 min, contínuo
//   node watch-standvirtual.ts --interval 60 --pages 2
//   node watch-standvirtual.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas de recentes/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './standvirtual/http.ts';
import { watch } from './standvirtual/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  defaultRate: 2500,
  HttpClient,
  watch,
});
