// run-autouncle.ts — CLI da recolha batch do AutoUncle (meta-motor/agregador, MULTI-PAÍS).
//
// Uso:
//   node run-autouncle.ts --max-pages 3                          # amostra PT (default)
//   node run-autouncle.ts --market dk --max-pages 3              # amostra Dinamarca
//   node run-autouncle.ts --market pt,fr,nl --max-pages 5        # vários mercados em sequência
//   node run-autouncle.ts --market all --full --max-pages 100    # cobertura total, todos os domínios
//   node run-autouncle.ts --market all --resume
//   node run-autouncle.ts --market all --http-only               # só HTTP puro (salta de/it/es/uk)
//
// Flags: --market <code|csv|all> (default pt; códigos em MARKETS — pt,de,dk,se,it,at,es,pl,fi,ro,
//        ch,uk,nl,fr), --max-pages <n> (default 5; cada página = 25 anúncios), --brand <Marca>
//        (faceta de path), --full (fatia por todas as marcas), --resume, --rate <ms>, --out <dir>.
// Stealth (browser p/ os domínios com Cloudflare ativo de/it/es/uk — automático): --http-only
//        desliga o browser (salta esses 4); --stealth força o browser em TODOS os mercados.
// Saída: NDJSON/checkpoint POR MERCADO (`autouncle-{code}-*`) + um summary agregado.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient, MARKETS, resolveMarket, type Market } from './autouncle/http.ts';
import { crawl, type MarketResult } from './autouncle/crawl.ts';
import { defineRunCli, topN } from './lib/cli.ts';

// '--market pt,dk' / 'all' / omisso (pt) → Market[].
function parseMarkets(spec: unknown): Market[] {
  const s = spec ? String(spec) : 'pt';
  if (s.toLowerCase() === 'all') return Object.values(MARKETS);
  return s.split(',').map(resolveMarket);
}

// resumo de um mercado para o summary.json (mesma forma do summary single-market antigo).
function marketSummary(m: MarketResult) {
  const avgPrice = m.stats.price.count ? Math.round(m.stats.price.sum / m.stats.price.count) : null;
  return {
    total: m.stats.records, pages: m.stats.pages, queries: m.queries, minDaysOnMarket: m.stats.minDaysOnMarket,
    price: { min: m.stats.price.min, max: m.stats.price.max, avg: avgPrice },
    byCountry: m.stats.byCountry, bySource: m.stats.bySource, byMake: m.stats.byMake,
    byFuel: m.stats.byFuel, byGearbox: m.stats.byGearbox, byRating: m.stats.byRating,
    nbResults: m.stats.nbResults, ndjson: m.ndjsonPath,
  };
}

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'autouncle',
  HttpClient,
  crawl,
  banner: (args) => {
    const brand = args.brand ? String(args.brand) : null;
    const markets = parseMarkets(args.market).map((m) => m.code).join(',');
    const mode = args['http-only'] ? ' | HTTP-ONLY' : args.stealth ? ' | STEALTH-ALL' : '';
    return `=== autouncle [${markets}] | max-pages: ${Number(args['max-pages']) || 5} (×25)`
      + `${brand ? ` | marca ${brand}` : ''}${args.full ? ' | MODO COMPLETO (fatiado por marca)' : ''}${mode} ===\n`;
  },
  buildConfig: (args, { http, outDir }) => ({
    http,
    markets: parseMarkets(args.market),
    full: Boolean(args.full),
    brand: args.brand ? String(args.brand) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
    stealth: Boolean(args.stealth),
    httpOnly: Boolean(args['http-only']),
  }),
  summarize: ({ markets }, { durationS }) => ({
    generatedAt: new Date().toISOString(), durationS,
    total: markets.reduce((n, m) => n + m.stats.records, 0),
    pages: markets.reduce((n, m) => n + m.stats.pages, 0),
    markets: Object.fromEntries(markets.map((m) => [m.code, marketSummary(m)])),
  }),
  report: ({ markets }, { durationS, summaryPath }) => {
    let total = 0;
    for (const m of markets) {
      total += m.stats.records;
      const avgPrice = m.stats.price.count ? Math.round(m.stats.price.sum / m.stats.price.count) : null;
      if (!m.stats.records) { console.log(`\n✗ ${m.sourceSite}: 0 anúncios (inacessível? ver avisos acima)`); continue; }
      console.log(`\n✓ ${m.sourceSite}: ${m.stats.records} anúncios | ${m.stats.pages} páginas | ${m.queries} query(s)`);
      console.log(`  preço: min ${m.stats.price.min} · máx ${m.stats.price.max} · média ${avgPrice}`);
      console.log(`  top fontes: ${topN(m.stats.bySource, 5)}`);
      console.log(`  top marcas: ${topN(m.stats.byMake, 5)}`);
      console.log(`  AutoScore (1–5): ${topN(m.stats.byRating, 5)}`);
      console.log(`  NDJSON → ${m.ndjsonPath}`);
    }
    console.log(`\nΣ ${total} anúncios em ${markets.length} mercado(s) | ${durationS}s`);
    console.log(`resumo → ${summaryPath}`);
  },
}).catch((e) => { console.error(e); process.exit(1); });
