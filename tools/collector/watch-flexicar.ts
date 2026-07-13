// watch-flexicar.ts — CLI da recolha CONTÍNUA do flexicar.es (poll da ordem default).
//
// Uso:
//   node watch-flexicar.ts                          # 1 em 1 min, contínuo
//   node watch-flexicar.ts --interval 60 --pages 2
//   node watch-flexicar.ts --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (facetas/ciclo — base + N-1 marcas, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './flexicar/http.ts';
import { watch } from './flexicar/watch.ts';

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
  http: new HttpClient({ minDelayMs: Number(args.rate) || 1500 }),
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
