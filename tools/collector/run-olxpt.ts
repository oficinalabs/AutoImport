// run-olxpt.ts — CLI da recolha batch do olx.pt (OLX Portugal, secção de carros; SSR).
//
// Uso:
//   node run-olxpt.ts --max-pages 3                 # amostra (3 páginas × 52 ≈ 156)
//   node run-olxpt.ts --full --max-pages 100        # catálogo completo, fatiado por marca
//   node run-olxpt.ts --make bmw --max-pages 5      # só uma marca (path SEO /carros/bmw/)
//   node run-olxpt.ts --region porto --max-pages 5  # só um distrito (/carros/porto/)
//   node run-olxpt.ts --resume
//
// Flags: --max-pages <n> (default 5; cada página ≈ 52 anúncios; teto do OLX = 100), --full (fateia por
//        marca até esgotar), --make <slug>, --region <slug>, --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './olxpt/http.ts';
import { crawl } from './olxpt/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'olxpt',
  HttpClient,
  crawl,
  banner: (args) => `=== olx.pt | max-pages: ${Number(args['max-pages']) || 5} (×52)${args.make ? ` | marca ${args.make}` : ''}`
    + `${args.region ? ` | distrito ${args.region}` : ''}${args.full ? ' | MODO COMPLETO (por marca)' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    make: args.make ? String(args.make) : null,
    region: args.region ? String(args.region) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats, queries }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, queries, catalogTotal: stats.catalogTotal,
      latestCreated: stats.latestCreated,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, bySellerType: stats.bySellerType, byMake: stats.byMake,
      byFuel: stats.byFuel, byRegion: stats.byRegion, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | catálogo ${stats.catalogTotal ?? '?'} | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`vendedor: ${topN(stats.bySellerType)}`);
    console.log(`top marcas: ${topN(stats.byMake)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top distritos: ${topN(stats.byRegion)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
