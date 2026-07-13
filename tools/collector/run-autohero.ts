// run-autohero.ts — CLI da recolha batch do autohero.com (API GraphQL do grupo AUTO1).
//
// Uso:
//   node run-autohero.ts --max-pages 3                 # amostra (3 páginas API × 100 = 300)
//   node run-autohero.ts --full --max-pages 100        # catálogo completo (~75 páginas no DE)
//   node run-autohero.ts --sort most_popular           # ordena por popularidade em vez de recência
//   node run-autohero.ts --resume
//
// Flags: --max-pages <n> (default 5; cada página = 100 anúncios), --full (esgota o catálogo),
//        --sort <newest_eligible|most_popular>, --resume, --rate <ms>, --out <dir>.
// (Não há --brand/--slice: a API pagina o catálogo inteiro por offset, sem precisar de fatiar.)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autohero/http.ts';
import { crawl } from './autohero/crawl.ts';
import { SORT_RECENTE } from './autohero/parse.ts';

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ? String(args.out) : join(__dir, 'out');
  const http = new HttpClient({ minDelayMs: Number(args.rate) || undefined });
  const sort = args.sort ? String(args.sort) : SORT_RECENTE;

  console.log(`=== autohero.com | max-pages: ${Number(args['max-pages']) || 5} (×100)`
    + ` | sort ${sort}${args.full ? ' | MODO COMPLETO' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
    sort,
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, catalogTotal: stats.total,
    latestPublished: stats.latestPublished,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, bySource: stats.bySource, byMake: stats.byMake,
    byFuel: stats.byFuel, byGearbox: stats.byGearbox, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autohero-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | catálogo ${stats.total ?? '?'} | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top marcas: ${top(stats.byMake)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`caixa: ${top(stats.byGearbox)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autohero-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
