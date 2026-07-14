// run-custojusto.ts — CLI da recolha batch do CustoJusto.pt.
//
// Uso:
//   node run-custojusto.ts --max-pages 3                    # amostra (base + primeiras facetas)
//   node run-custojusto.ts --brand peugeot --max-pages 1    # só uma marca (slug do path)
//   node run-custojusto.ts --full --max-pages 1500          # cobertura fatiada marca×distrito
//   node run-custojusto.ts --resume
//
// ⚠️ SEM paginação (`?o=N` robots-proibido): a unidade é a FACETA (path-based). `--max-pages` limita
// o nº de facetas processadas por execução. Ver custojusto/crawl.ts.
//
// Flags: --max-pages <n> (default 5), --brand <slug>, --full, --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './custojusto/http.ts';
import { crawl } from './custojusto/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'custojusto',
  HttpClient,
  crawl,
  banner: (args) => `=== custojusto.pt${args.brand ? ` | marca ${args.brand}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (marca×distrito)' : ''} ===\n`,
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
      total: stats.records, facets: stats.facets,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byRegion: stats.byRegion, bySource: stats.bySource, byFuel: stats.byFuel, nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.facets} facetas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`por distrito: ${topN(stats.byRegion)}`);
    console.log(`por vendedor: ${topN(stats.bySource)}`);
    console.log(`por combustível: ${topN(stats.byFuel)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
