// run-autoline.mjs — CLI da recolha batch do autoline.pt (marketplace Via Mobilis; secção BE).
//
// Uso:
//   node run-autoline.mjs --max-pages 3                    # amostra (carros, Bélgica)
//   node run-autoline.mjs --country DE --max-pages 2       # carros de outro país (Alemanha)
//   node run-autoline.mjs --full --max-pages 500           # cobertura UE fatiada por país
//   node run-autoline.mjs --resume
//
// Flags: --max-pages <n> (default 5), --country <CC> (default BE), --full, --resume,
//        --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoline/http.mjs';
import { crawl } from './autoline/crawl.mjs';

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
  const country = args.country ? String(args.country).toUpperCase() : 'BE';

  console.log(`=== autoline.pt | carros ${args.full ? '(TODOS os países UE)' : country}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por país)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    country,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, auctions: stats.auctions, maxId: stats.maxId,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel, bySource: stats.bySource,
    nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autoline-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${stats.auctions} em leilão | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top países: ${top(stats.byCountry)}`);
  console.log(`top regiões: ${top(stats.byRegion)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top vendedores: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autoline-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
