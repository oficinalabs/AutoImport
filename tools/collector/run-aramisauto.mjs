// run-aramisauto.mjs — CLI da recolha batch do aramisauto.com.
//
// Uso:
//   node run-aramisauto.mjs --max-pages 3                    # amostra (listagem geral /achat/)
//   node run-aramisauto.mjs --slice diesel --max-pages 2     # só um silo (/achat/diesel/)
//   node run-aramisauto.mjs --full --max-pages 200           # cobertura fatiada por categoria
//   node run-aramisauto.mjs --resume
//
// Flags: --max-pages <n> (default 5), --slice <silo>, --full, --resume, --rate <ms>, --out <dir>.
// (`--slice` é o análogo do `--brand` dos outros coletores: aqui o aramisauto não tem path por
//  marca, mas expõe silos SEO por categoria/combustível — ex. `diesel`, `4x4-et-suv`, `occasion`.)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './aramisauto/http.mjs';
import { crawl } from './aramisauto/crawl.mjs';

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
  // Crawl-delay 5s do robots → default 5000ms (afinável com --rate, com cautela).
  const http = new HttpClient({ minDelayMs: Number(args.rate) || 5000 });

  console.log(`=== aramisauto.com${args.slice ? ` | silo ${args.slice}` : ''}`
    + ` | max-pages: ${Number(args['max-pages']) || 5}${args.full ? ' | MODO COMPLETO (fatiado por categoria)' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats } = await crawl({
    http,
    full: Boolean(args.full),
    slice: args.slice ? String(args.slice) : null,
    maxPages: Number(args['max-pages']) || 5,
    outDir,
    resume: Boolean(args.resume),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, maxId: stats.maxId,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byOfferType: stats.byOfferType, byCategory: stats.byCategory,
    byFuel: stats.byFuel, bySource: stats.bySource,
    nbResults: stats.nbResults, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'aramisauto-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`top categorias: ${top(stats.byCategory)}`);
  console.log(`top combustível: ${top(stats.byFuel)}`);
  console.log(`tipo de oferta: ${top(stats.byOfferType)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'aramisauto-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
