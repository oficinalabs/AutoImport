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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './flexicar/http.ts';
import { crawl } from './flexicar/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'flexicar',
  HttpClient,
  crawl,
  banner: (args) => `=== flexicar.es${args.brand ? ` | marca ${args.brand}` : ''}`
    + ` | max-pages (facetas): ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (facetas do sitemap)' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats, facets, done }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, facets: stats.facets, facetsPlanned: facets, facetsDone: done, maxId: stats.maxId,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel, bySource: stats.bySource,
      nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.facets} facetas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top regiões: ${topN(stats.byRegion)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top concessionários: ${topN(stats.bySource)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
