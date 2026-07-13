// run-flexicar.ts — CLI da recolha batch do flexicar.es.
//
// Uso:
//   node run-flexicar.ts --max-pages 3                 # amostra (base + fatias por marca)
//   node run-flexicar.ts --brand audi --max-pages 1    # só uma marca (rota /audi/segunda-mano/)
//   node run-flexicar.ts --full --max-pages 500        # cobertura fatiada por faceta (seed sitemap)
//   node run-flexicar.ts --resume
//
// Flags: --max-pages <n> (default 5), --brand <slug>, --full, --resume, --rate <ms>, --out <dir>.
//   ⚠️ No Flexicar o SSR não pagina (devolve 12/URL; a API de paginação é robots-proibida). Por isso a
//   unidade é a FACETA: --max-pages limita o nº de facetas a percorrer (cada uma = 12 anúncios). Ver
//   research/flexicar-investigacao.md.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './flexicar/http.ts';
import { crawl } from './flexicar/crawl.ts';

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

  console.log(`=== flexicar.es${args.brand ? ` | marca ${args.brand}` : ''}`
    + ` | max-pages (facetas): ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (facetas do sitemap)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats, facets, done } = await crawl({
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
    total: stats.records, facets: stats.facets, facetsPlanned: facets, facetsDone: done, maxId: stats.maxId,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel, bySource: stats.bySource,
    nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'flexicar-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.facets} facetas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top regiões: ${top(stats.byRegion)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top concessionários: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'flexicar-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
