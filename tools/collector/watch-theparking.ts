// watch-theparking.ts — CLI da recolha CONTÍNUA do theparking.eu (polling de recentes).
//
// Faz poll da página de anúncios mais recentes de X em X tempo, deteta novos e mudanças
// de preço, e emite-os para o sink (hoje: NDJSON de eventos; futuro: upsert na DB).
//
// Uso:
//   node watch-theparking.ts                              # 1 em 1 min, DE/NL/BE/FR
//   node watch-theparking.ts --country belgium --make bmw
//   node watch-theparking.ts --interval 60 --pages 1      # intervalo em segundos
//   node watch-theparking.ts --interval 15 --cycles 3     # teste: 3 ciclos e sai
//
// Flags:
//   --country <slug|nome-pt>  país-alvo (repetível). Default: DE,NL,BE,FR.
//   --make <slug>             estreitar por marca.
//   --pages <n>               páginas de recentes por query (default 1).
//   --interval <seg>          intervalo entre ciclos (default 60).
//   --cycles <n>              nº de ciclos e termina (0/omisso = contínuo).
//   --rate <ms>               intervalo mínimo entre pedidos HTTP (default 1500).
//   --out <dir>               diretório de saída (default ./out).

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './theparking/http.ts';
import { watch } from './theparking/watch.ts';
import { defineWatchCli } from './lib/cli.ts';
import { parseArgs } from './theparking/cli-args.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
  parseArgs,
  buildConfig: (args) => ({
    countries: args.countries,
    make: args.make ? String(args.make) : null,
  }),
});
