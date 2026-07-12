// run-autopt.mjs — CLI da recolha batch do auto.pt.
//
// Uso:
//   node run-autopt.mjs --max-pages 3                     # amostra (listagem geral)
//   node run-autopt.mjs --make renault --max-pages 2      # só uma marca (path /carros-usados/{slug})
//   node run-autopt.mjs --district lisboa --max-pages 2   # só um distrito (path)
//   node run-autopt.mjs --full --max-pages 900            # cobertura fatiada por marca
//   node run-autopt.mjs --resume
//
// Flags: --max-pages <n> (default 5), --make <slug>, --district <slug>, --full, --resume,
//        --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autopt/http.mjs';
import { crawl } from './autopt/crawl.mjs';

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ? String(args.out) : join(__dir, 'out');
  const http = new HttpClient({ minDelayMs: Number(args.rate) || 1500 });

  const slice = args.make ? `marca ${args.make}` : args.district ? `distrito ${args.district}` : null;
  console.log(`=== auto.pt${slice ? ` | ${slice}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    make: args.make ? String(args.make) : null,
    district: args.district ? String(args.district) : null,
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
    byCountry: stats.byCountry, byOwner: stats.byOwner, byRegion: stats.byRegion,
    byFuel: stats.byFuel, bySource: stats.bySource, nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autopt-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`tipo vendedor: ${top(stats.byOwner)}`);
  console.log(`top distritos: ${top(stats.byRegion)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top stands: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autopt-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
