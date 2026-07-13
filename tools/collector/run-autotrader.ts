// run-autotrader.ts — CLI da recolha batch do AutoTrader.nl.
//
// Uso:
//   node run-autotrader.ts --max-pages 3                 # amostra (lista default)
//   node run-autotrader.ts --make 13 --max-pages 5       # só uma marca (mmvmk0; BMW=13)
//   node run-autotrader.ts --full --max-pages 200        # cobertura por faixas de preço
//   node run-autotrader.ts --resume
//
// Flags: --max-pages <n> (default 5), --make <mmvmk0 id>, --full, --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autotrader/http.ts';
import { crawl } from './autotrader/crawl.ts';

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
  const http = new HttpClient({ minDelayMs: Number(args.rate) || 1500 });

  console.log(`=== AutoTrader.nl${args.make ? ` | marca mmvmk0=${args.make}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (faixas de preço)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    make: args.make ? String(args.make) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, bySource: stats.bySource, nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autotrader-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top dealers: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autotrader-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
