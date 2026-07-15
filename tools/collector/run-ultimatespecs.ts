// run-ultimatespecs.ts — CLI do coletor de CATÁLOGO do ultimatespecs.com.
//
// Ao contrário dos outros coletores (anúncios), recolhe a REFERÊNCIA de versões de modelo
// (designação, ano, potência, cilindrada, combustível) para alimentar o matching. Ver
// ultimatespecs/crawl.ts para o desenho e o ritmo (robots Crawl-delay: 30 s — inegociável).
//
// Uso:
//   node run-ultimatespecs.ts --make kia --make hyundai --since-year 2010
//   node run-ultimatespecs.ts --since-year 2008 --max-models 200      # fatia diária
//   node run-ultimatespecs.ts --resume                                # retomar
//   node run-ultimatespecs.ts --make bmw --deep                       # + ficha completa (CO₂…)
//
// Flags:
//   --make <marca>     filtro por marca (repetível; ex. --make alfa-romeo).
//   --since-year <n>   só modelos com ano ≥ n no slug (sem ano no slug passam sempre).
//   --deep             além do resumo, a ficha completa de cada versão (1 pedido/versão).
//   --max-models <n>   máximo de páginas de modelo neste run (default: sem limite).
//   --resume           retomar do checkpoint.
//   --rate <ms>        intervalo entre pedidos (mínimo 30000 — clamp ao robots).
//   --out <dir>        diretório de saída (default ./out).

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRunCli, topN } from './lib/cli.ts';
import { crawl } from './ultimatespecs/crawl.ts';
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
    + `${args.deep ? ' | DEEP' : ''} ===\n`,
  buildConfig: (args, { http, outDir }) => ({
    http,
    makes: args.make.length ? args.make : null,
    sinceYear: Number(args['since-year']) || null,
    deep: Boolean(args.deep),
    maxModels: Number(args['max-models']) || 0,
    outDir,
    resume: Boolean(args.resume),
  }),
  summarize: ({ ndjsonPath, stats, alvo }, { durationS, args }) => ({
    generatedAt: new Date().toISOString(),
    makes: args.make.length ? args.make : 'todas',
    sinceYear: Number(args['since-year']) || null,
    deep: Boolean(args.deep),
    durationS,
    total: stats.records,
    modelPages: stats.pages,
    deepPages: stats.deepPages,
    alvo,
    semPotencia: stats.semPotencia,
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
  },
});
