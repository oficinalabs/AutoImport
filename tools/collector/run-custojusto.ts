// run-custojusto.ts — CLI da recolha batch do CustoJusto.pt.
//
// Uso:
//   node run-custojusto.ts --max-pages 3                    # amostra (base + primeiras facetas)
//   node run-custojusto.ts --brand peugeot --max-pages 1    # só uma marca (slug do path)
//   node run-custojusto.ts --full --max-pages 1500          # cobertura fatiada marca×distrito
//   node run-custojusto.ts --resume
//
// ⚠️ SEM paginação (`?o=N` robots-proibido): a unidade é a FACETA (path-based). `--max-pages` limita
// o nº de facetas processadas por execução. Ver custojusto/crawl.ts.
//
// Flags: --max-pages <n> (default 5), --brand <slug>, --full, --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './custojusto/http.ts';
import { crawl } from './custojusto/crawl.ts';

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

  console.log(`=== custojusto.pt${args.brand ? ` | marca ${args.brand}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (marca×distrito)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, facets: stats.facets,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byRegion: stats.byRegion, bySource: stats.bySource, byFuel: stats.byFuel, nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'custojusto-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.facets} facetas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`por distrito: ${top(stats.byRegion)}`);
  console.log(`por vendedor: ${top(stats.bySource)}`);
  console.log(`por combustível: ${top(stats.byFuel)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'custojusto-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
