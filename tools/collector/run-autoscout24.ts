// run-autoscout24.ts — CLI da recolha batch do AutoScout24 (HTTP puro, pan-europeu).
//
// ⚠️ O AutoScout24 é MAIS RESTRITIVO que os outros 23 coletores: o robots.txt bloqueia UAs de
// bots-IA (Disallow: /) e proíbe a pesquisa base /lst? e as páginas /angebote/. A recolha com
// params livres e UA de browser é uma ESCOLHA EXPLÍCITA do utilizador, documentada com
// transparência em research/autoscout24-investigacao.md. HTTP puro passa (200, sem challenge);
// Scrapling só se começarem a desafiar sob volume.
//
// Uso:
//   node run-autoscout24.ts --make bmw --max-pages 3          # amostra 1 marca (~300 anúncios, size=100)
//   node run-autoscout24.ts --country D,A,B,E,F,I,L,NL --make bmw --max-pages 1   # pan-EU
//   node run-autoscout24.ts --full                            # cobertura pan-EU (país×marca×preço)
//   node run-autoscout24.ts --full --country D --make bmw --max-pages 2  # fatia + sub-fatia preço
//   node run-autoscout24.ts --detail --make bmw --max-pages 1 # enriquece (1 req/anúncio)
//   node run-autoscout24.ts --resume
//
// Flags: --max-pages <n> (5), --size <n> (100), --country <cy,...>, --make <slug|id>, --full,
//        --detail, --resume, --rate <ms>, --out <dir>.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './autoscout24/http.ts';
import { crawl, PAN_EU } from './autoscout24/crawl.ts';
import { slugify, type MakeRef } from './autoscout24/parse.ts';

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

// --make aceita slug ("bmw", "mercedes-benz") ou id numérico (mmvmk0). Devolve {id,slug,label}.
function parseMake(v: string | true | undefined): MakeRef | null {
  if (v == null || v === true) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return { id: s, slug: null, label: s };
  return { id: null, slug: slugify(s), label: s };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ? String(args.out) : join(__dir, 'out');
  const full = Boolean(args.full);
  const http = new HttpClient({ minDelayMs: Number(args.rate) || 1500 });

  // Países: --country tem prioridade; no --full sem --country → todos os pan-EU; senão sem filtro.
  const countries = args.country
    ? String(args.country).split(',').map((s) => s.trim()).filter(Boolean)
    : (full ? PAN_EU : [null]);
  const make = parseMake(args.make);
  const makes = make ? [make] : null;   // null → (full) semear taxonomy; (amostra) sem filtro

  console.log(`=== AutoScout24 | países: ${countries.map((c) => c || 'ALL').join(',')}`
    + `${make ? ` | marca ${make.slug || make.id}` : (full ? ' | marcas: taxonomy' : '')}`
    + ` | size ${Number(args.size) || 100} | max-pages ${Number(args['max-pages']) || 5}`
    + `${full ? ' | MODO COMPLETO (adaptativo país×marca×preço)' : ''}${args.detail ? ' | +DETALHE' : ''} ===\n`);

  const t0 = Date.now();
  const { ndjsonPath, stats, facets } = await crawl({
    http,
    full,
    countries,
    makes,
    maxPages: Number(args['max-pages']) || 5,
    size: Number(args.size) || 100,
    outDir,
    resume: Boolean(args.resume),
    detail: Boolean(args.detail),
  });
  const durationS = Math.round((Date.now() - t0) / 1000);

  const avgPrice = stats.price.count ? Math.round(stats.price.sum / stats.price.count) : null;
  const summary = {
    generatedAt: new Date().toISOString(), durationS,
    total: stats.records, pages: stats.pages, facets,
    price: { min: stats.price.min, max: stats.price.max, avg: avgPrice },
    byCountry: stats.byCountry, byPriceEval: stats.byPriceEval, bySource: stats.bySource, ndjson: ndjsonPath,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'autoscout24-summary.json'), JSON.stringify(summary, null, 2));

  const top = (obj: Record<string, number>, n = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`\n✓ ${stats.records} anúncios | ${stats.pages} páginas | ${facets} facetas | ${durationS}s`);
  console.log(`preço €: min ${stats.price.min} · máx ${stats.price.max} · média ${avgPrice}`);
  console.log(`por país: ${top(stats.byCountry)}`);
  console.log(`avaliação preço (1=muito bom … 5=alto): ${top(stats.byPriceEval)}`);
  console.log(`top dealers: ${top(stats.bySource)}`);
  console.log(`\nNDJSON → ${ndjsonPath}`);
  console.log(`resumo → ${join(outDir, 'autoscout24-summary.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
