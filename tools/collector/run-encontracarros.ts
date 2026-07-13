// run-encontracarros.ts — CLI da recolha batch do encontracarros.pt (agregador PT; via sitemap +
// páginas de detalhe SSR).
//
// Uso:
//   node run-encontracarros.ts --max-pages 3                  # amostra: ~90 anúncios mais recentes
//   node run-encontracarros.ts --brand bmw --max-pages 2      # só uma marca (filtro do slug)
//   node run-encontracarros.ts --district porto --max-pages 2 # só um distrito (filtro do slug)
//   node run-encontracarros.ts --since 2026-07-12 --max-pages 5   # só lastmod recente
//   node run-encontracarros.ts --full                         # cobertura máxima (~50k, longo)
//   node run-encontracarros.ts --resume
//
// Flags: --max-pages <n> (default 5; 1 pág = 30 anúncios), --brand <slug>, --district <slug>,
//        --since <ISO>, --full, --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './encontracarros/http.ts';
import { crawl } from './encontracarros/crawl.ts';

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

  const slice = args.brand ? `marca ${args.brand}` : args.district ? `distrito ${args.district}` : null;
  console.log(`=== encontracarros.pt (agregador)${slice ? ` | ${slice}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    district: args.district ? String(args.district) : null,
    since: args.since ? String(args.since) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, fetched: stats.fetched, sitemapTotal: stats.total,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byNational: stats.byNational, byRegion: stats.byRegion,
    byFuel: stats.byFuel, bySource: stats.bySource, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'encontracarros-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas (${stats.fetched} buscados) | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`nacional/importado: ${top(stats.byNational)}`);
  console.log(`top distritos: ${top(stats.byRegion)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top sites de origem: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'encontracarros-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
