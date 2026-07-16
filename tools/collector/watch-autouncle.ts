// watch-autouncle.ts — CLI da recolha CONTÍNUA de UM mercado AutoUncle (poll na ordem default).
//
// Uso:
//   node watch-autouncle.ts                          # PT, 1 em 1 min, contínuo
//   node watch-autouncle.ts --market dk              # Dinamarca
//   node watch-autouncle.ts --interval 60 --pages 2
//   node watch-autouncle.ts --interval 12 --cycles 2 # teste
//   node watch-autouncle.ts --brand Renault          # vigia só uma marca (faceta de path)
//
// Flags: --market <code> (default pt; um só mercado por processo), --pages <n> (páginas/ciclo × 25,
//        default 1), --interval <seg> (default 60), --cycles <n> (0/omisso = contínuo),
//        --brand <Marca>, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient, resolveMarket } from './autouncle/http.ts';
import { watch } from './autouncle/watch.ts';
import { defineWatchCli } from './lib/cli.ts';

await defineWatchCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  HttpClient,
  watch,
  buildConfig: (args) => ({
    market: resolveMarket(args.market ? String(args.market) : 'pt'),
    brand: args.brand ? String(args.brand) : null,
  }),
});
