// cli-args.ts — parsing de argumentos específico do AutoScout24 (run/watch).
//
// Outlier vs os outros coletores: resolve `countries` (--country csv), `make` (slug|id) e `makes`.
// A resolução difere entre run e watch (defaults de países e de size), por isso há um parseArgs
// por CLI; `parseMake` é partilhado.

import { parseArgs as parseFlags } from '../lib/cli.ts';
import { slugify, type MakeRef } from './parse.ts';
import { PAN_EU } from './crawl.ts';

// --make aceita slug ("bmw", "mercedes-benz") ou id numérico (mmvmk0). Devolve {id,slug,label}.
export function parseMake(v: unknown): MakeRef | null {
  if (v == null || v === true) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return { id: s, slug: null, label: s };
  return { id: null, slug: slugify(s), label: s };
}

export interface Autoscout24RunArgs extends Record<string, unknown> {
  countries: (string | null)[];
  make: MakeRef | null;
  makes: MakeRef[] | null;
}

// run: --country tem prioridade; no --full sem --country → todos os pan-EU; senão sem filtro ([null]).
export function parseRunArgs(argv: string[]): Autoscout24RunArgs {
  const args = parseFlags(argv);
  const full = Boolean(args.full);
  const countries = args.country
    ? String(args.country).split(',').map((s) => s.trim()).filter(Boolean)
    : (full ? PAN_EU : [null]);
  const make = parseMake(args.make);
  const makes = make ? [make] : null;   // null → (full) semear taxonomy; (amostra) sem filtro
  return { ...args, countries, make, makes };
}

export interface Autoscout24WatchArgs extends Record<string, unknown> {
  countries: (string | null)[];
}

// watch: --country tem prioridade; default DE ('D').
export function parseWatchArgs(argv: string[]): Autoscout24WatchArgs {
  const args = parseFlags(argv);
  const countries = args.country
    ? String(args.country).split(',').map((s) => s.trim()).filter(Boolean)
    : ['D'];
  return { ...args, countries };
}
