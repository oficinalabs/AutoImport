// run-autopt.ts — CLI da recolha batch do auto.pt.
//
// Uso:
//   node run-autopt.ts --max-pages 3                     # amostra (listagem geral)
//   node run-autopt.ts --make renault --max-pages 2      # só uma marca (path /carros-usados/{slug})
//   node run-autopt.ts --district lisboa --max-pages 2   # só um distrito (path)
//   node run-autopt.ts --full --max-pages 900            # cobertura fatiada por marca
//   node run-autopt.ts --resume
//
// Flags: --max-pages <n> (default 5), --make <slug>, --district <slug>, --full, --resume,
//        --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autopt/http.ts';
import { crawl } from './autopt/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autopt',
  HttpClient,
  crawl,
  banner: (args) => {
    const slice = args.make ? `marca ${args.make}` : args.district ? `distrito ${args.district}` : null;
    return `=== auto.pt${slice ? ` | ${slice}` : ''}`
      + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    make: args.make ? String(args.make) : null,
    district: args.district ? String(args.district) : null,
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
      byCountry: stats.byCountry, byOwner: stats.byOwner, byRegion: stats.byRegion,
      byFuel: stats.byFuel, bySource: stats.bySource, nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`tipo vendedor: ${topN(stats.byOwner)}`);
    console.log(`top distritos: ${topN(stats.byRegion)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top stands: ${topN(stats.bySource)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
