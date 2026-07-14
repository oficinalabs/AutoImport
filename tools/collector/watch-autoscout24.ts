// watch-autoscout24.ts — CLI da recolha CONTÍNUA do AutoScout24 (poll de recentes).
//
// ✅ Usa a ordenação REAL por data de publicação do AS24 (sort=age&desc=1) — recência genuína,
// não um proxy (ao contrário do autotrader.nl). Ver research/autoscout24-investigacao.md.
//
// Uso:
//   node watch-autoscout24.ts                                  # 1 em 1 min, contínuo (DE)
//   node watch-autoscout24.ts --country D,F --pages 2
//   node watch-autoscout24.ts --make bmw --online-since 1      # só publicados no último dia
//   node watch-autoscout24.ts --interval 12 --cycles 2         # teste
//
// Flags: --country <cy,...>, --make <slug|id>, --pages <n> (1), --size <n> (20),
//        --interval <seg> (60), --cycles <n> (0/omisso=contínuo), --online-since <1..14>,
//        --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoscout24/http.ts';
import { watch } from './autoscout24/watch.ts';
import { defineWatchCli } from './lib/cli.ts';
import { parseMake, parseWatchArgs } from './autoscout24/cli-args.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
  parseArgs: parseWatchArgs,
  buildConfig: (args) => ({
    countries: args.countries,
    make: parseMake(args.make),
    size: Number(args.size) || 20,
    onlineSince: args['online-since'] ? Number(args['online-since']) : null,
  }),
});
