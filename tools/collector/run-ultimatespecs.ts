// run-ultimatespecs.ts — CLI do coletor de CATÁLOGO do ultimatespecs.com.
//
// Ao contrário dos outros coletores (anúncios), recolhe a REFERÊNCIA de versões de modelo
// (designação, ano, potência, cilindrada, combustível) para alimentar o matching. Ver
// ultimatespecs/crawl.ts para o desenho; sobre o ritmo (Crawl-delay 30 s por omissão,
// exceção --fast) ver a secção do README.
//
// DESTINO: com DATABASE_URL (env ou .env.local da raiz) o upsert é DIRETO na BD
// (us_models/us_versions) e não fica nada em disco — o resume é implícito (deriva
// da BD; relançar continua onde ficou). --ndjson força o modo local (NDJSON +
// checkpoint, replay via scripts/pipeline/ingest-ultimatespecs.ts).
//
// Uso:
//   node run-ultimatespecs.ts --make kia --make hyundai --since-year 2010
//   node run-ultimatespecs.ts --since-year 2008 --max-models 200      # fatia diária
//   node run-ultimatespecs.ts --make bmw --deep                       # + ficha completa (CO₂…)
//   node run-ultimatespecs.ts --deep --fast                           # CATÁLOGO COMPLETO (~3 h)
//   node run-ultimatespecs.ts --ndjson --resume                       # modo local + retomar
//
// Flags:
//   --make <marca>     filtro por marca (repetível; ex. --make alfa-romeo).
//   --since-year <n>   só modelos com ano ≥ n no slug (sem ano no slug passam sempre).
//   --deep             além do resumo, a ficha completa de cada versão (1 pedido/versão).
//   --max-models <n>   máximo de páginas de modelo neste run (default: sem limite).
//   --ndjson           força NDJSON local mesmo com DATABASE_URL.
//   --resume           retomar do checkpoint (só modo NDJSON; na BD é automático).
//   --fast             ignora o crawl-delay: pool de workers (exceção deliberada; README).
//   --concurrency <n>  nº de workers em --fast (default 6).
//   --rate <ms>        intervalo entre pedidos; sem --fast tem clamp a 30000; com --fast
//                      é POR WORKER (default 1000, piso 500).
//   --out <dir>        diretório de saída do modo NDJSON (default ./out).

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRunCli, topN } from './lib/cli.ts';
import { crawl } from './ultimatespecs/crawl.ts';
import { createUsDbSink } from './ultimatespecs/db-sink.ts';
import { CRAWL_DELAY_MS, HttpClient } from './ultimatespecs/http.ts';

interface UsArgs {
  make: string[];
  [key: string]: string | boolean | string[];
}

// --make é repetível; aceita "alfa-romeo" ou "Alfa Romeo" (normaliza para lowercase c/ espaços).
function parseArgs(argv: string[]): UsArgs {
  const args: UsArgs = { make: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key === 'make') args.make.push(String(val).toLowerCase().replace(/-/g, ' ').trim());
    else args[key] = val;
  }
  return args;
}

await defineRunCli({
  dir: dirname(fileURLToPath(import.meta.url)),
  site: 'ultimatespecs',
  defaultRate: CRAWL_DELAY_MS,
  HttpClient,
  crawl,
  parseArgs,
  banner: (args) => `=== ultimatespecs.com | catálogo de versões`
    + `${args.make.length ? ` | marcas: ${args.make.join(', ')}` : ' | todas as marcas'}`
    + `${args['since-year'] ? ` | ano ≥ ${args['since-year']}` : ''}`
    + `${args.deep ? ' | DEEP' : ''}`
    + `${args.fast ? ` | FAST (crawl-delay do robots IGNORADO — exceção deliberada)` : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => {
    const fast = Boolean(args.fast);
    const rateMs = Number(args.rate) || (fast ? 1000 : CRAWL_DELAY_MS);
    const db = args.ndjson ? null : createUsDbSink();
    if (!db) console.log(args.ndjson ? '≡ destino: NDJSON local (--ndjson)' : '≡ destino: NDJSON local (sem DATABASE_URL)');
    return {
      // Em --fast até o inventário (sitemaps) usa um cliente sem crawl-delay.
      http: fast ? new HttpClient({ ignoreCrawlDelay: true, minDelayMs: rateMs }) : http,
      makes: args.make.length ? args.make : null,
      sinceYear: Number(args['since-year']) || null,
      deep: Boolean(args.deep),
      maxModels: Number(args['max-models']) || 0,
      concurrency: fast ? Number(args.concurrency) || 6 : 1,
      rateMs,
      fast,
      db,
      outDir,
      resume: Boolean(args.resume),
    };
  },
  summarize: ({ ndjsonPath, stats, alvo }, { durationS, args }) => ({
    generatedAt: new Date().toISOString(),
    makes: args.make.length ? args.make : 'todas',
    sinceYear: Number(args['since-year']) || null,
    deep: Boolean(args.deep),
    fast: Boolean(args.fast),
    durationS,
    total: stats.records,
    modelPages: stats.pages,
    deepPages: stats.deepPages,
    alvo,
    semPotencia: stats.semPotencia,
    falhas: stats.falhas,
    byMake: stats.byMake,
    byFuel: stats.byFuel,
    ndjson: ndjsonPath,
  }),
  report: ({ stats, alvo }, { durationS }) => {
    console.log(`\n✓ ${stats.records} versões de ${stats.pages}/${alvo} modelos em ${durationS}s`
      + `${stats.deepPages ? ` (+${stats.deepPages} fichas deep)` : ''}`);
    console.log(`  por combustível: ${topN(stats.byFuel)}`);
    console.log(`  por marca: ${topN(stats.byMake)}`);
    if (stats.semPotencia) console.log(`  ⚠ sem potência: ${stats.semPotencia}`);
    if (stats.falhas) console.log(`  ⚠ páginas sem resposta: ${stats.falhas} (relançar para tentar de novo)`);
  },
});
