// run-olxpt.mjs — CLI da recolha batch do olx.pt (OLX Portugal, secção de carros; SSR).
//
// Uso:
//   node run-olxpt.mjs --max-pages 3                 # amostra (3 páginas × 52 ≈ 156)
//   node run-olxpt.mjs --full --max-pages 100        # catálogo completo, fatiado por marca
//   node run-olxpt.mjs --make bmw --max-pages 5      # só uma marca (path SEO /carros/bmw/)
//   node run-olxpt.mjs --region porto --max-pages 5  # só um distrito (/carros/porto/)
//   node run-olxpt.mjs --resume
//
// Flags: --max-pages <n> (default 5; cada página ≈ 52 anúncios; teto do OLX = 100), --full (fateia por
//        marca até esgotar), --make <slug>, --region <slug>, --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './olxpt/http.mjs';
import { crawl } from './olxpt/crawl.mjs';

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
  const maxPages = Number(args['max-pages']) || 5;

  console.log(`=== olx.pt | max-pages: ${maxPages} (×52)${args.make ? ` | marca ${args.make}` : ''}`
    + `${args.region ? ` | distrito ${args.region}` : ''}${args.full ? ' | MODO COMPLETO (por marca)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats, queries } = await crawl({
    http,
    full: Boolean(args.full),
    make: args.make ? String(args.make) : null,
    region: args.region ? String(args.region) : null,
    maxPages,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, queries, catalogTotal: stats.catalogTotal,
    latestCreated: stats.latestCreated,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, bySellerType: stats.bySellerType, byMake: stats.byMake,
    byFuel: stats.byFuel, byRegion: stats.byRegion, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'olxpt-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | catálogo ${stats.catalogTotal ?? '?'} | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`vendedor: ${top(stats.bySellerType)}`);
  console.log(`top marcas: ${top(stats.byMake)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top distritos: ${top(stats.byRegion)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'olxpt-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
