// watch-custojusto.ts — CLI da recolha CONTÍNUA do CustoJusto.pt (poll da listagem base).
//
// Uso:
//   node watch-custojusto.ts                     # 1 em 1 min, contínuo
//   node watch-custojusto.ts --interval 60
//   node watch-custojusto.ts --interval 12 --cycles 2   # teste
//
// ⚠️ SEM paginação (`?o=N` robots-proibido): cada ciclo lê a 1ª página da listagem base (40 mais
// recentes, ordenados por data). Não há flag --pages (não paginamos). Ver custojusto/watch.ts.
//
// Flags: --interval <seg> (default 60), --cycles <n> (0/omisso = contínuo), --rate <ms>, --out <dir>.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './custojusto/http.ts';
import { watch } from './custojusto/watch.ts';

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
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
