// run-autohero.ts — CLI da recolha batch do autohero.com (API GraphQL do grupo AUTO1).
//
// Uso:
//   node run-autohero.ts --max-pages 3                 # amostra (3 páginas API × 100 = 300)
//   node run-autohero.ts --full --max-pages 100        # catálogo completo (~75 páginas no DE)
//   node run-autohero.ts --sort most_popular           # ordena por popularidade em vez de recência
//   node run-autohero.ts --resume
//
// Flags: --max-pages <n> (default 5; cada página = 100 anúncios), --full (esgota o catálogo),
//        --sort <newest_eligible|most_popular>, --resume, --rate <ms>, --out <dir>.
// (Não há --brand/--slice: a API pagina o catálogo inteiro por offset, sem precisar de fatiar.)

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autohero/http.ts';
import { crawl } from './autohero/crawl.ts';
import { SORT_RECENTE } from './autohero/parse.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autohero',
  HttpClient,
  crawl,
  banner: (args) => {
    const sort = args.sort ? String(args.sort) : SORT_RECENTE;
    return `=== autohero.com | max-pages: ${Number(args['max-pages']) || 5} (×100)`
      + ` | sort ${sort}${args.full ? ' | MODO COMPLETO' : ''} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
    sort: args.sort ? String(args.sort) : SORT_RECENTE,
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, catalogTotal: stats.total,
      latestPublished: stats.latestPublished,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, bySource: stats.bySource, byMake: stats.byMake,
      byFuel: stats.byFuel, byGearbox: stats.byGearbox, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | catálogo ${stats.total ?? '?'} | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`caixa: ${topN(stats.byGearbox)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
