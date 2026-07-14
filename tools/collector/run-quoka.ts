// run-quoka.ts — CLI da recolha batch do quoka.de.
//
// Uso:
//   node run-quoka.ts --max-pages 3                       # amostra (listagem geral de carros)
//   node run-quoka.ts --brand volkswagen --max-pages 5    # só uma marca (slug do path)
//   node run-quoka.ts --full --max-pages 500              # cobertura fatiada por marca
//   node run-quoka.ts --resume
//
// Flags: --max-pages <n> (default 5), --brand <slug>, --full, --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './quoka/http.ts';
import { crawl } from './quoka/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'quoka',
  HttpClient,
  crawl,
  banner: (args) => `=== quoka.de${args.brand ? ` | marca ${args.brand}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel, byMake: stats.byMake,
      bySource: stats.bySource, nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top regiões: ${topN(stats.byRegion)}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
