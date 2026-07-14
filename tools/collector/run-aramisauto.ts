// run-aramisauto.ts — CLI da recolha batch do aramisauto.com.
//
// Uso:
//   node run-aramisauto.ts --max-pages 3                    # amostra (listagem geral /achat/)
//   node run-aramisauto.ts --slice diesel --max-pages 2     # só um silo (/achat/diesel/)
//   node run-aramisauto.ts --full --max-pages 200           # cobertura fatiada por categoria
//   node run-aramisauto.ts --resume
//
// Flags: --max-pages <n> (default 5), --slice <silo>, --full, --resume, --rate <ms>, --out <dir>.
// (`--slice` é o análogo do `--brand` dos outros coletores: aqui o aramisauto não tem path por
//  marca, mas expõe silos SEO por categoria/combustível — ex. `diesel`, `4x4-et-suv`, `occasion`.)

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './aramisauto/http.ts';
import { crawl } from './aramisauto/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'aramisauto',
  // Crawl-delay 5s do robots → default 5000ms (afinável com --rate, com cautela).
  defaultRate: 5000,
  HttpClient,
  crawl,
  banner: (args) => `=== aramisauto.com${args.slice ? ` | silo ${args.slice}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por categoria)' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    full: Boolean(args.full),
    slice: args.slice ? String(args.slice) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats }, { durationS }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    return {
      generatedAt: new Date().toISOString(), durationS,
      total: stats.records, pages: stats.pages, maxId: stats.maxId,
      price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
      byCountry: stats.byCountry, byOfferType: stats.byOfferType, byCategory: stats.byCategory,
      byFuel: stats.byFuel, bySource: stats.bySource,
      nbResults: stats.nbResults, ndjson: ndjsonPath,
    };
  },
  report: ({ ndjsonPath, stats }, { durationS, summaryPath }) => {
    const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
    console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
    console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
    console.log(`top categorias: ${topN(stats.byCategory)}`);
    console.log(`top combustível: ${topN(stats.byFuel)}`);
    console.log(`tipo de oferta: ${topN(stats.byOfferType)}`);
    console.log(`\nNDJSON → ${ndjsonPath}`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
