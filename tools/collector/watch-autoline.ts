// watch-autoline.ts — CLI da recolha CONTÍNUA do autoline.pt (poll da ordem default do país).
//
// Uso:
//   node watch-autoline.ts                              # 1 em 1 min, contínuo (carros BE)
//   node watch-autoline.ts --country DE --interval 60 --pages 2
//   node watch-autoline.ts --interval 12 --cycles 2     # teste
//
// Flags: --country <CC> (default BE), --pages <n> (páginas/ciclo, default 1),
//        --interval <seg> (default 60), --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoline/http.ts';
import { watch } from './autoline/watch.ts';

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
  country: args.country ? String(args.country).toUpperCase() : 'BE',
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
