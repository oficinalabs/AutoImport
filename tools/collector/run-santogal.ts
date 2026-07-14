// run-santogal.ts — CLI da recolha batch do santogal.pt.
//
// Uso:
//   node run-santogal.ts --max-pages 3               # amostra (usados, todas as marcas)
//   node run-santogal.ts --make BMW --max-pages 2    # só uma marca (querytext=Usados {MARCA})
//   node run-santogal.ts --full                      # cobertura completa (~39 páginas, ~1.538)
//   node run-santogal.ts --resume
//
// Flags: --max-pages <n> (default 5), --make <MARCA>, --full, --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './santogal/http.ts';
import { crawl } from './santogal/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'santogal',
  HttpClient,
  crawl,
  banner: (args) => `=== santogal.pt${args.make ? ` | marca ${args.make}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (~39 págs)' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    make: args.make ? String(args.make) : null,
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
      byCountry: stats.byCountry, byMake: stats.byMake, byFuel: stats.byFuel,
      byCondition: stats.byCondition, bySource: stats.bySource, nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`condição: ${topN(stats.byCondition)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
