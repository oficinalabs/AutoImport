// run-theparking.ts — CLI e orquestração do coletor do theparking.eu.
//
// Uso:
//   node run-theparking.ts                                  # amostra: DE,NL,BE,FR (default)
//   node run-theparking.ts --country belgium --make bmw --max-pages 3
//   node run-theparking.ts --country germany --country netherlands --max-pages 2
//   node run-theparking.ts --country portugal --max-pages 10   # inventário PT (~128k; via oparking bloqueado)
//   node run-theparking.ts --full --max-pages 10            # cobertura por país×modelo (longo)
//   node run-theparking.ts --resume                         # retomar a última recolha
//
// Flags:
//   --country <slug>   país-alvo (repetível). Aceita slug EN ou nome PT. Default: DE,NL,BE,FR.
//   --make <slug>      estreitar por marca (ex. bmw). Só no modo amostra.
//   --max-pages <n>    páginas por query (default 5). 27 anúncios/página.
//   --rate <ms>        intervalo mínimo entre pedidos (default 1500).
//   --full             cobertura máxima: fatiar país × modelo (usa o sitemap).
//   --resume           retomar a partir do checkpoint.
//   --out <dir>        diretório de saída (default ./out).
//
// Documentação e o "porquê" de cada decisão: ver README.md deste diretório.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './theparking/http.ts';
import { crawl } from './theparking/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';
import { parseArgs } from './theparking/cli-args.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'theparking',
  HttpClient,
  crawl,
  parseArgs,
  banner: (args) => `=== theparking.eu | países: ${args.countries.join(', ')}`
    + `${args.make ? ` | marca: ${args.make}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}`
    + `${args.full ? ' | MODO COMPLETO' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    countries: args.countries,
    make: args.make ? String(args.make) : null,
    full: Boolean(args.full),
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats, queries }, { durationS, args }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(),
      countries: args.countries, queries, durationS,
      total: stats.records, pages: stats.pages,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, bySource: stats.bySource, nbResults: stats.nbResults,
      ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`países: ${topN(stats.byCountry)}`);
    console.log(`fontes: ${topN(stats.bySource)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
