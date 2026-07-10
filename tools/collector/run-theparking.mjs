// run-theparking.mjs — CLI e orquestração do coletor do theparking.eu.
//
// Uso:
//   node run-theparking.mjs                                  # amostra: DE,NL,BE,FR (default)
//   node run-theparking.mjs --country belgium --make bmw --max-pages 3
//   node run-theparking.mjs --country germany --country netherlands --max-pages 2
//   node run-theparking.mjs --full --max-pages 10            # cobertura por país×modelo (longo)
//   node run-theparking.mjs --resume                         # retomar a última recolha
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

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './theparking/http.mjs';
import { crawl } from './theparking/crawl.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// Nomes de país (PT/EN) -> slug usado no URL do theparking.eu.
const PAISES = {
  germany: 'germany', alemanha: 'germany',
  france: 'france', franca: 'france', 'frança': 'france',
  belgium: 'belgium', belgica: 'belgium', 'bélgica': 'belgium',
  netherlands: 'netherlands', holanda: 'netherlands', 'paises-baixos': 'netherlands',
  spain: 'spain', espanha: 'spain',
};

// Parser de argumentos minimalista (suporta flags repetíveis via acumulação).
function parseArgs(argv) {
  const args = { country: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key === 'country') args.country.push(String(val).toLowerCase());
    else args[key] = val;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Resolve países (default: os 4 viáveis confirmados — DE, NL, BE, FR).
  const pedidos = args.country.length ? args.country : ['germany', 'netherlands', 'belgium', 'france'];
  const countries = [...new Set(pedidos.map((c) => PAISES[c]).filter(Boolean))];
  if (!countries.length) { console.error('✗ nenhum país válido. Ex.: --country belgium'); process.exit(1); }

  const outDir = args.out ? String(args.out) : join(__dir, 'out');
  const http = new HttpClient({ minDelayMs: Number(args.rate) || 1500 });

  console.log(`=== theparking.eu | países: ${countries.join(', ')}`
    + `${args.make ? ` | marca: ${args.make}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}`
    + `${args.full ? ' | MODO COMPLETO' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats, queries } = await crawl({
    http,
    countries,
    make: args.make ? String(args.make) : null,
    full: Boolean(args.full),
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  // Resumo persistido + impresso.
  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(),
    countries, queries, durationS,
    total: stats.records, pages: stats.pages,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, bySource: stats.bySource, nbResults: stats.nbResults,
    ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'theparking-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`países: ${top(stats.byCountry)}`);
  console.log(`fontes: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'theparking-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
