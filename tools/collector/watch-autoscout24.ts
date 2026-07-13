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

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoscout24/http.ts';
import { watch } from './autoscout24/watch.ts';
import { slugify } from './autoscout24/parse.ts';

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

function parseMake(v: string | true | undefined): { id: string | null; slug: string | null } | null {
  if (v == null || v === true) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return { id: s, slug: null };
  return { id: null, slug: slugify(s) };
}

const args = parseArgs(process.argv.slice(2));
const countries = args.country
  ? String(args.country).split(',').map((s) => s.trim()).filter(Boolean)
  : ['D'];

await watch({
  http: new HttpClient({ minDelayMs: Number(args.rate) || 1500 }),
  countries,
  make: parseMake(args.make),
  pages: Number(args.pages) || 1,
  size: Number(args.size) || 20,
  intervalMs: (Number(args.interval) || 60) * 1000,
  cycles: Number(args.cycles) || 0,
  onlineSince: args['online-since'] ? Number(args['online-since']) : null,
  outDir: args.out ? String(args.out) : join(__dir, 'out'),
});
