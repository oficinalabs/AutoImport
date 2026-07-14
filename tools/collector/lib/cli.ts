// lib/cli.ts — casca partilhada dos CLIs dos coletores (run-*.ts / watch-*.ts).
//
// PORQUÊ: o port .mjs→.ts preservou 48 cópias byte-a-byte de `parseArgs`, um `top()` idêntico
// em todos os `run-*`, e o mesmo "spine" (outDir → new HttpClient → crawl/watch → summary.json).
// Aqui vive esse boilerplate uma única vez; cada CLI fica só com o que é específico do site
// (mapeamento de flags, forma do summary, linhas de log) via callbacks pequenos.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

type Args = Record<string, unknown>;

// Parser de argumentos minimalista: `--flag valor` → { flag: 'valor' }; `--flag` só → { flag: true }.
export function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

// top-N de um mapa {chave: contagem} como string "chave:n  chave:n" (para os logs de stats).
export function topN(obj: Record<string, number>, n = 8): string {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
}

// Construtor de HttpClient (cada coletor passa a sua classe; só usamos minDelayMs aqui).
type HttpCtor<H> = new (opts: { minDelayMs?: number }) => H;

interface RunCliOptions<A extends Args, H, C, R> {
  dir: string;                                                   // __dir do CLI (raiz do collector)
  site: string;                                                  // prefixo dos ficheiros (`<site>-summary.json`)
  defaultRate?: number;                                          // minDelayMs default (1500)
  HttpClient: HttpCtor<H>;
  crawl: (config: C) => Promise<R>;
  parseArgs?: (argv: string[]) => A;                            // override p/ flags repetíveis (ex. theparking)
  buildConfig: (args: A, ctx: { http: H; outDir: string }) => C; // flags → config do crawl
  summarize: (result: R, ctx: { durationS: number; args: A }) => object; // objeto do summary.json
  report?: (result: R, ctx: { durationS: number; outDir: string; summaryPath: string }) => void;
  banner?: (args: A) => string;                                 // linha impressa antes do crawl
}

// Spine do run-*.ts: parse → outDir → HttpClient → crawl → summary.json → report.
export async function defineRunCli<A extends Args, H, C, R>(opts: RunCliOptions<A, H, C, R>): Promise<void> {
  const parse = opts.parseArgs ?? (parseArgs as (argv: string[]) => A);
  const args = parse(process.argv.slice(2));
  const outDir = args.out ? String(args.out) : join(opts.dir, 'out');
  const http = new opts.HttpClient({ minDelayMs: Number(args.rate) || (opts.defaultRate ?? 1500) });

  if (opts.banner) console.log(opts.banner(args));

  const t0 = Date.now();
  const result = await opts.crawl(opts.buildConfig(args, { http, outDir }));
  const durationS = Math.round((Date.now() - t0) / 1000);

  const summary = opts.summarize(result, { durationS, args });
  const summaryPath = join(outDir, `${opts.site}-summary.json`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  if (opts.report) opts.report(result, { durationS, outDir, summaryPath });
}

interface WatchCliOptions<A extends Args, H, W> {
  dir: string;
  defaultRate?: number;
  HttpClient: HttpCtor<H>;
  watch: (config: W) => Promise<unknown>;
  parseArgs?: (argv: string[]) => A;
  buildConfig?: (args: A) => Record<string, unknown>;           // knobs extra (slug/brand/country/make/size…)
}

// Wiring do watch-*.ts: parse → new HttpClient({minDelayMs}) → watch({http, pages, intervalMs, cycles, outDir, …}).
export async function defineWatchCli<A extends Args, H, W>(opts: WatchCliOptions<A, H, W>): Promise<void> {
  const parse = opts.parseArgs ?? (parseArgs as (argv: string[]) => A);
  const args = parse(process.argv.slice(2));
  await opts.watch({
    http: new opts.HttpClient({ minDelayMs: Number(args.rate) || (opts.defaultRate ?? 1500) }),
    pages: Number(args.pages) || 1,
    intervalMs: (Number(args.interval) || 60) * 1000,
    cycles: Number(args.cycles) || 0,
    outDir: args.out ? String(args.out) : join(opts.dir, 'out'),
    ...(opts.buildConfig ? opts.buildConfig(args) : {}),
  } as W);
}
