// watch-aramisauto.ts — CLI da recolha CONTÍNUA do aramisauto.com (poll da ordem default).
//
// Uso:
//   node watch-aramisauto.ts                          # 1 em 1 min, contínuo
//   node watch-aramisauto.ts --interval 60 --pages 2
//   node watch-aramisauto.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './aramisauto/http.ts';
import { watch } from './aramisauto/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  // Crawl-delay 5s do robots → default 5000ms (afinável com --rate, com cautela).
  defaultRate: 5000,
  HttpClient,
  watch,
});
