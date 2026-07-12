// watch-standvirtual.mjs — CLI da recolha CONTÍNUA do standvirtual.com (poll de recentes).
//
// Uso:
//   node watch-standvirtual.mjs                     # 1 em 1 min, contínuo
//   node watch-standvirtual.mjs --interval 60 --pages 2
//   node watch-standvirtual.mjs --interval 12 --cycles 2   # teste
//
// Flags: --pages <n> (páginas de recentes/ciclo, default 1), --interval <seg> (default 60),
//        --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './standvirtual/http.mjs';
import { watch } from './standvirtual/watch.mjs';

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
  http: new HttpClient({ minDelayMs: Number(args.rate) || 2500 }),
  pages: Number(args.pages) || 1,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
