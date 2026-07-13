// watch-caetano.mjs — CLI da recolha CONTÍNUA da Caetano (poll por recência da API Digital Store).
//
// Uso:
//   node watch-caetano.mjs                            # 1 em 1 min, contínuo
//   node watch-caetano.mjs --interval 60 --pages 2
//   node watch-caetano.mjs --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas/ciclo × 250, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './caetano/http.mjs';
import { watch } from './caetano/watch.mjs';

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
  http: new HttpClient({ minDelayMs: Number(args.rate) || undefined }),
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
