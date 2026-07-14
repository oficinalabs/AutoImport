// run-autosapo.ts — CLI da recolha batch do auto.sapo.pt (marketplace nacional do portal SAPO).
//
// Uso:
//   node run-autosapo.ts --max-pages 3                  # amostra (3 páginas × 20 = 60 cartões)
//   node run-autosapo.ts --full                         # catálogo completo (~1218 páginas, ~24k)
//   node run-autosapo.ts --slice "marca=volvo"          # só uma marca (657 viaturas / 33 págs)
//   node run-autosapo.ts --max-pages 2 --detail         # enriquece com a pág. de detalhe (lento)
//   node run-autosapo.ts --resume
//
// Flags: --max-pages <n> (default 5; cada página = 20 anúncios), --full (esgota o catálogo),
//        --slice <filtro> (querystring cru, ex. "marca=bmw" ou "localizacao=porto"),
//        --detail (1 pedido extra/anúncio: caixa/cor/distrito/vendedor/nacional — só p/ amostras),
//        --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autosapo/http.ts';
import { crawl } from './autosapo/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autosapo',
  HttpClient,
  crawl,
  banner: (args) => {
    const slice = typeof args.slice === 'string' ? args.slice : null;
    return `=== auto.sapo.pt | max-pages: ${Number(args['max-pages']) || 5} (×20)`
      + `${slice ? ` | fatia "${slice}"` : ''}${args.detail ? ' | +DETALHE' : ''}`
      + `${args.full ? ' | MODO COMPLETO' : ''} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    slice: typeof args.slice === 'string' ? args.slice : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
    detail: Boolean(args.detail),
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, catalogTotal: stats.total, highlighted: stats.highlighted,
      latestPublished: stats.latestPublished,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, bySource: stats.bySource, byMake: stats.byMake,
      byFuel: stats.byFuel, byRegion: stats.byRegion, bySeller: stats.bySeller, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | catálogo ${stats.total ?? '?'} | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`NDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
