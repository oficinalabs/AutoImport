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

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './caetano/http.ts';
import { crawl } from './caetano/crawl.ts';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ? String(args.out) : join(__dir, 'out');
  const http = new HttpClient({ minDelayMs: Number(args.rate) || undefined });

  console.log(`=== caetano.pt | max-pages: ${Number(args['max-pages']) || 5} (×250 viaturas)`
    + `${args.full ? ' | MODO COMPLETO' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, rawTotal: stats.rawTotal,
    latestUpdate: stats.latestUpdate,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byRegion: stats.byRegion, byMake: stats.byMake,
    byFuel: stats.byFuel, byUsedType: stats.byUsedType, bySource: stats.bySource, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'caetano-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} carros usados | ${stats.pages} páginas | catálogo bruto ${stats.rawTotal ?? '?'} (carros+motas+novos) | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top marcas: ${top(stats.byMake)}`);
  console.log(`top distritos: ${top(stats.byRegion)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`top instalações: ${top(stats.bySource)}`);
  console.log(`tipo usado: ${top(stats.byUsedType)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'caetano-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
