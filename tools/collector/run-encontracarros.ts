// run-encontracarros.ts — CLI da recolha batch do encontracarros.pt (agregador PT; via sitemap +
// páginas de detalhe SSR).
//
// Uso:
//   node run-encontracarros.ts --max-pages 3                  # amostra: ~90 anúncios mais recentes
//   node run-encontracarros.ts --brand bmw --max-pages 2      # só uma marca (filtro do slug)
//   node run-encontracarros.ts --district porto --max-pages 2 # só um distrito (filtro do slug)
//   node run-encontracarros.ts --since 2026-07-12 --max-pages 5   # só lastmod recente
//   node run-encontracarros.ts --full                         # cobertura máxima (~50k, longo)
//   node run-encontracarros.ts --resume
//
// Flags: --max-pages <n> (default 5; 1 pág = 30 anúncios), --brand <slug>, --district <slug>,
//        --since <ISO>, --full, --resume, --rate <ms>, --out <dir>.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './encontracarros/http.ts';
import { crawl } from './encontracarros/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'encontracarros',
  HttpClient,
  crawl,
  banner: (args) => {
    const slice = args.brand ? `marca ${args.brand}` : args.district ? `distrito ${args.district}` : null;
    return `=== encontracarros.pt (agregador)${slice ? ` | ${slice}` : ''}`
      + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO' : ''} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    district: args.district ? String(args.district) : null,
    since: args.since ? String(args.since) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, fetched: stats.fetched, sitemapTotal: stats.total,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byNational: stats.byNational, byRegion: stats.byRegion,
      byFuel: stats.byFuel, bySource: stats.bySource, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas (${stats.fetched} buscados) | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`nacional/importado: ${topN(stats.byNational)}`);
    console.log(`top distritos: ${topN(stats.byRegion)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`top sites de origem: ${topN(stats.bySource)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
