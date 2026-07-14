// run-autouncle.ts — CLI da recolha batch do autouncle.pt (meta-motor/agregador, versão PT).
//
// Uso:
//   node run-autouncle.ts --max-pages 3                 # amostra (3 páginas × 25 = 75)
//   node run-autouncle.ts --brand Renault --max-pages 5 # só uma marca (slug canónico do path)
//   node run-autouncle.ts --full --max-pages 100        # cobertura fatiada por marca (config API)
//   node run-autouncle.ts --resume
//
// Flags: --max-pages <n> (default 5; cada página = 25 anúncios), --brand <Marca> (faceta de path),
//        --full (fatia por todas as marcas), --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autouncle/http.ts';
import { crawl } from './autouncle/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autouncle',
  HttpClient,
  crawl,
  banner: (args) => {
    const brand = args.brand ? String(args.brand) : null;
    return `=== autouncle.pt | max-pages: ${Number(args['max-pages']) || 5} (×25)`
      + `${brand ? ` | marca ${brand}` : ''}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats, queries }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, queries, minDaysOnMarket: stats.minDaysOnMarket,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, bySource: stats.bySource, byMake: stats.byMake,
      byFuel: stats.byFuel, byGearbox: stats.byGearbox, byRating: stats.byRating,
      nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats, queries }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${queries} query(s) | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top fontes: ${topN(stats.bySource)}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`combustível: ${topN(stats.byFuel)}`);
    console.log(`AutoScore (1–5): ${topN(stats.byRating)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
