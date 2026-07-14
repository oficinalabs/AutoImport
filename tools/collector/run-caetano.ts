// run-caetano.ts — CLI da recolha batch da Caetano (rede de stands do Grupo Salvador Caetano;
// stock de usados/seminovos via a API "Digital Store" api.gsci.pt, companyId 24).
//
// Uso:
//   node run-caetano.ts --max-pages 3            # amostra (3 páginas API × 250 viaturas)
//   node run-caetano.ts --full --max-pages 30    # catálogo completo (~13 páginas)
//   node run-caetano.ts --resume
//
// Flags: --max-pages <n> (default 5; cada página = 250 viaturas, das quais só carros usados entram),
//        --full (esgota o catálogo), --resume, --rate <ms>, --out <dir>.
// (Não há --brand/--slice: a API pagina o catálogo inteiro por página, sem precisar de fatiar.)

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './caetano/http.ts';
import { crawl } from './caetano/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'caetano',
  HttpClient,
  crawl,
  banner: (args) => `=== caetano.pt | max-pages: ${Number(args['max-pages']) || 5} (×250 viaturas)`
    + `${args.full ? ' | MODO COMPLETO' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, rawTotal: stats.rawTotal,
      latestUpdate: stats.latestUpdate,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byRegion: stats.byRegion, byMake: stats.byMake,
      byFuel: stats.byFuel, byUsedType: stats.byUsedType, bySource: stats.bySource, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} carros usados | ${stats.pages} páginas | catálogo bruto ${stats.rawTotal ?? '?'} (carros+motas+novos) | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`top distritos: ${topN(stats.byRegion)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top instalações: ${topN(stats.bySource)}`);
    console.log(`tipo usado: ${topN(stats.byUsedType)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
