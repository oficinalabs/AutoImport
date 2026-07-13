// run-autosapo.mjs — CLI da recolha batch do auto.sapo.pt (marketplace nacional do portal SAPO).
//
// Uso:
//   node run-autosapo.mjs --max-pages 3                  # amostra (3 páginas × 20 = 60 cartões)
//   node run-autosapo.mjs --full                         # catálogo completo (~1218 páginas, ~24k)
//   node run-autosapo.mjs --slice "marca=volvo"          # só uma marca (657 viaturas / 33 págs)
//   node run-autosapo.mjs --max-pages 2 --detail         # enriquece com a pág. de detalhe (lento)
//   node run-autosapo.mjs --resume
//
// Flags: --max-pages <n> (default 5; cada página = 20 anúncios), --full (esgota o catálogo),
//        --slice <filtro> (querystring cru, ex. "marca=bmw" ou "localizacao=porto"),
//        --detail (1 pedido extra/anúncio: caixa/cor/distrito/vendedor/nacional — só p/ amostras),
//        --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autosapo/http.mjs';
import { crawl } from './autosapo/crawl.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
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
  const slice = typeof args.slice === 'string' ? args.slice : null;

  console.log(`=== auto.sapo.pt | max-pages: ${Number(args['max-pages']) || 5} (×20)`
    + `${slice ? ` | fatia "${slice}"` : ''}${args.detail ? ' | +DETALHE' : ''}`
    + `${args.full ? ' | MODO COMPLETO' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    slice,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
    detail: Boolean(args.detail),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, catalogTotal: stats.total, highlighted: stats.highlighted,
    latestPublished: stats.latestPublished,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, bySource: stats.bySource, byMake: stats.byMake,
    byFuel: stats.byFuel, byRegion: stats.byRegion, bySeller: stats.bySeller, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autosapo-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | catálogo ${stats.total ?? '?'} | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top marcas: ${top(stats.byMake)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`NDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autosapo-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
