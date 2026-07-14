// watch-encontracarros.ts — CLI da recolha CONTÍNUA do encontracarros.pt (poll do sitemap por
// recência real via `lastmod`).
//
// Uso:
//   node watch-encontracarros.ts                            # 1 em 1 min, contínuo
//   node watch-encontracarros.ts --interval 60 --pages 2
//   node watch-encontracarros.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (janela do 1º ciclo, ×30, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './encontracarros/http.ts';
import { watch } from './encontracarros/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
});
