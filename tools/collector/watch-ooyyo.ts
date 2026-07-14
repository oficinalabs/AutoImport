// watch-ooyyo.ts — CLI da recolha CONTÍNUA do Ooyyo (secção BE; poll da ordem default).
//
// Uso:
//   node watch-ooyyo.ts                          # 1 em 1 min, contínuo
//   node watch-ooyyo.ts --interval 60 --pages 2
//   node watch-ooyyo.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms> (default 30000, honra Crawl-delay),
//        --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './ooyyo/http.ts';
import { watch } from './ooyyo/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  defaultRate: 30000,
  HttpClient,
  watch,
});
