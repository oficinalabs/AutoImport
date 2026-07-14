// run-autoline.ts — CLI da recolha batch do autoline.pt (marketplace Via Mobilis; secção BE).
//
// Uso:
//   node run-autoline.ts --max-pages 3                    # amostra (carros, Bélgica)
//   node run-autoline.ts --country DE --max-pages 2       # carros de outro país (Alemanha)
//   node run-autoline.ts --full --max-pages 500           # cobertura UE fatiada por país
//   node run-autoline.ts --resume
//
// Flags: --max-pages <n> (default 5), --country <CC> (default BE), --full, --resume,
//        --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoline/http.ts';
import { crawl } from './autoline/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autoline',
  HttpClient,
  crawl,
  banner: (args) => {
    const country = args.country ? String(args.country).toUpperCase() : 'BE';
    return `=== autoline.pt | carros ${args.full ? '(TODOS os países UE)' : country}`
      + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por país)' : ''} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    country: args.country ? String(args.country).toUpperCase() : 'BE',
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, auctions: stats.auctions, maxId: stats.maxId,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel, bySource: stats.bySource,
      nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${stats.auctions} em leilão | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top países: ${topN(stats.byCountry)}`);
    console.log(`top regiões: ${topN(stats.byRegion)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top vendedores: ${topN(stats.bySource)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
