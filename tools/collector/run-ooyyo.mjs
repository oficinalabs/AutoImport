// run-ooyyo.mjs — CLI da recolha batch do Ooyyo (secção Bélgica).
//
// Uso:
//   node run-ooyyo.mjs --max-pages 3                  # amostra (toda a Bélgica)
//   node run-ooyyo.mjs --make bmw --max-pages 2       # só uma marca (via qselements idMake)
//   node run-ooyyo.mjs --full --max-pages 500         # cobertura fatiada por marca
//   node run-ooyyo.mjs --resume
//
// Flags: --max-pages <n> (default 5), --make <nome/slug>, --full, --resume, --rate <ms>, --out <dir>.
// ⚠️ --rate: default 30000 ms (honra o Crawl-delay: 30 do robots.txt). Baixar só com critério.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './ooyyo/http.mjs';
import { crawl } from './ooyyo/crawl.mjs';

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
  const http = new HttpClient({ minDelayMs: Number(args.rate) || 30000 });

  console.log(`=== Ooyyo (Bélgica)${args.make ? ` | marca ${args.make}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`);

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
    byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel,
    byCategory: stats.byCategory, bySource: stats.bySource,
    nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'ooyyo-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top fontes (site de origem): ${top(stats.bySource)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top carroçaria: ${top(stats.byCategory)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'ooyyo-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
