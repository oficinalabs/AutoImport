// run-autoscout24.ts — CLI da recolha batch do AutoScout24 (HTTP puro, pan-europeu).
//
// ⚠️ O AutoScout24 é MAIS RESTRITIVO que os outros 23 coletores: o robots.txt bloqueia UAs de
// bots-IA (Disallow: /) e proíbe a pesquisa base /lst? e as páginas /angebote/. A recolha com
// params livres e UA de browser é uma ESCOLHA EXPLÍCITA do utilizador, documentada com
// transparência em research/autoscout24-investigacao.md. HTTP puro passa (200, sem challenge);
// Scrapling só se começarem a desafiar sob volume.
//
// Uso:
//   node run-autoscout24.ts --make bmw --max-pages 3          # amostra 1 marca (~300 anúncios, size=100)
//   node run-autoscout24.ts --country D,A,B,E,F,I,L,NL --make bmw --max-pages 1   # pan-EU
//   node run-autoscout24.ts --full                            # cobertura pan-EU (país×marca×preço)
//   node run-autoscout24.ts --full --country D --make bmw --max-pages 2  # fatia + sub-fatia preço
//   node run-autoscout24.ts --detail --make bmw --max-pages 1 # enriquece (1 req/anúncio)
//   node run-autoscout24.ts --resume
//
// Flags: --max-pages <n> (5), --size <n> (100), --country <cy,...>, --make <slug|id>, --full,
//        --detail, --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoscout24/http.ts';
import { crawl } from './autoscout24/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';
import { parseRunArgs } from './autoscout24/cli-args.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autoscout24',
  HttpClient,
  crawl,
  parseArgs: parseRunArgs,
  banner: (args) => `=== AutoScout24 | países: ${args.countries.map((c) => c || 'ALL').join(',')}`
    + `${args.make ? ` | marca ${args.make.slug || args.make.id}` : (args.full ? ' | marcas: taxonomy' : '')}`
    + ` | size ${Number(args.size) || 100} | max-pages ${Number(args['max-pages']) || 5}`
    + `${args.full ? ' | MODO COMPLETO (adaptativo país×marca×preço)' : ''}${args.detail ? ' | +DETALHE' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    countries: args.countries,
    makes: args.makes,
    maxPages: Number(args['max-pages']) || 5,
    size: Number(args.size) || 100,
    outDir,
    resume: Boolean(args.resume),
    detail: Boolean(args.detail),
  }),
  summarize: ({ ndjsonPath, stats, facets }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, facets,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byPriceEval: stats.byPriceEval, bySource: stats.bySource, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats, facets }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${facets} facetas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`por país: ${topN(stats.byCountry)}`);
    console.log(`avaliação preço (1=muito bom … 5=alto): ${topN(stats.byPriceEval)}`);
    console.log(`top dealers: ${topN(stats.bySource)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
