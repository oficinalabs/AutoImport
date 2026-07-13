// watch-autouncle.ts — CLI da recolha CONTÍNUA do autouncle.pt (poll na ordem default).
//
// Uso:
//   node watch-autouncle.ts                          # 1 em 1 min, contínuo
//   node watch-autouncle.ts --interval 60 --pages 2
//   node watch-autouncle.ts --interval 12 --cycles 2 # teste
//   node watch-autouncle.ts --brand Renault          # vigia só uma marca (faceta de path)
//
// Flags: --pages <n> (páginas/ciclo × 25, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --brand <Marca>, --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autouncle/http.ts';
import { watch } from './autouncle/watch.ts';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
await watch({
  http: new HttpClient({ minDelayMs: Number(args.rate) || undefined }),
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  brand: args.brand ? String(args.brand) : null,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
