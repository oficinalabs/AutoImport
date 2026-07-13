// run-autouncle.mjs — CLI da recolha batch do autouncle.pt (meta-motor/agregador, versão PT).
//
// Uso:
//   node run-autouncle.mjs --max-pages 3                 # amostra (3 páginas × 25 = 75)
//   node run-autouncle.mjs --brand Renault --max-pages 5 # só uma marca (slug canónico do path)
//   node run-autouncle.mjs --full --max-pages 100        # cobertura fatiada por marca (config API)
//   node run-autouncle.mjs --resume
//
// Flags: --max-pages <n> (default 5; cada página = 25 anúncios), --brand <Marca> (faceta de path),
//        --full (fatia por todas as marcas), --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autouncle/http.mjs';
import { crawl } from './autouncle/crawl.mjs';

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
  const http = new HttpClient({ minDelayMs: Number(args.rate) || undefined });
  const brand = args.brand ? String(args.brand) : null;

  console.log(`=== autouncle.pt | max-pages: ${Number(args['max-pages']) || 5} (×25)`
    + `${brand ? ` | marca ${brand}` : ''}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats, queries } = await crawl({
    http,
    full: Boolean(args.full),
    brand,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, queries, minDaysOnMarket: stats.minDaysOnMarket,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, bySource: stats.bySource, byMake: stats.byMake,
    byFuel: stats.byFuel, byGearbox: stats.byGearbox, byRating: stats.byRating,
    nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autouncle-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${queries} query(s) | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top fontes: ${top(stats.bySource)}`);
  console.log(`top marcas: ${top(stats.byMake)}`);
  console.log(`combustível: ${top(stats.byFuel)}`);
  console.log(`AutoScore (1–5): ${top(stats.byRating)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autouncle-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
