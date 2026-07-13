// watch-aramisauto.mjs — CLI da recolha CONTÍNUA do aramisauto.com (poll da ordem default).
//
// Uso:
//   node watch-aramisauto.mjs                          # 1 em 1 min, contínuo
//   node watch-aramisauto.mjs --interval 60 --pages 2
//   node watch-aramisauto.mjs --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './aramisauto/http.mjs';
import { watch } from './aramisauto/watch.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
await watch({
  // Crawl-delay 5s do robots → default 5000ms (afinável com --rate, com cautela).
  http: new HttpClient({ minDelayMs: Number(args.rate) || 5000 }),
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
