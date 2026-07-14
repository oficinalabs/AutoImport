// run-ooyyo.ts — CLI da recolha batch do Ooyyo (secção Bélgica).
//
// Uso:
//   node run-ooyyo.ts --max-pages 3                  # amostra (toda a Bélgica)
//   node run-ooyyo.ts --make bmw --max-pages 2       # só uma marca (via qselements idMake)
//   node run-ooyyo.ts --full --max-pages 500         # cobertura fatiada por marca
//   node run-ooyyo.ts --resume
//
// Flags: --max-pages <n> (default 5), --make <nome/slug>, --full, --resume, --rate <ms>, --out <dir>.
// ⚠️ --rate: default 30000 ms (honra o Crawl-delay: 30 do robots.txt). Baixar só com critério.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './ooyyo/http.ts';
import { crawl } from './ooyyo/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'ooyyo',
  defaultRate: 30000,
  HttpClient,
  crawl,
  banner: (args) => `=== Ooyyo (Bélgica)${args.make ? ` | marca ${args.make}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''} ===\n`,
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
      byCountry: stats.byCountry, byRegion: stats.byRegion, byFuel: stats.byFuel,
      byCategory: stats.byCategory, bySource: stats.bySource,
      nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top fontes (site de origem): ${topN(stats.bySource)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top carroçaria: ${topN(stats.byCategory)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
