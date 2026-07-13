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

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './ooyyo/http.ts';
import { watch } from './ooyyo/watch.ts';

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
  http: new HttpClient({ minDelayMs: Number(args.rate) || 30000 }),
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
