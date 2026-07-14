// lib/crawl.ts — inner-core partilhado da recolha BATCH (crawl) dos coletores.
//
// PORQUÊ: os 24 crawl.ts repetiam o MESMO inner-core: Set `seen` (dedupe global por id),
// `appendFileSync` do NDJSON, acumulação de stats, e o IO do checkpoint (load/resume + save).
// Só variam (a) os buckets de stats (por-site) e (b) o MODELO DE PAGINAÇÃO. Aqui:
//   - `createCrawlWriter` — dono do seen/append/stats/checkpoint (usado pelos 24). Os buckets
//     ficam nos callbacks `newStats`/`updateStats` do coletor (forma inalterada).
//   - `runPagedCrawl` — o loop `for query { for page }` completo, parametrizado (17 page-loop).
//     Os 7 outliers (offset/facet/sitemap/nextUrl) mantêm o loop próprio + usam o writer.
//
// Forma garantida: o writer NÃO toca em parse.ts/schema.ts; escreve o registo tal-e-qual
// (`JSON.stringify(record)`), como antes. O risco fica na orquestração (dedupe/resume), não na forma.

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CrawlWriter<T, S> {
  ndjsonPath: string;
  collectedAt: string;
  stats: S;
  cursor: unknown;                     // cursor persistido (resume), ou null (arranque fresco)
  add: (record: T) => boolean;         // dedupe+append+updateStats; true se novo
  has: (id: string) => boolean;        // pertença ao seen (pré-skip sem re-fetch; outliers sitemap/detail)
  save: (cursor?: unknown) => void;    // persiste checkpoint {startedAt, ndjson, seen, stats, cursor}
  readonly seenCount: number;
}

interface CrawlWriterConfig<T, S extends { records: number }> {
  outDir: string;
  source: string;
  resume: boolean;
  recordId: (record: T) => string | null | undefined;
  newStats: () => S;
  updateStats: (stats: S, record: T) => void;
  resumeLog?: (w: { stats: S; cursor: unknown; seenCount: number }) => string;
}

// Compat: checkpoints pré-refactor (5c5073a) guardavam o progresso do loop (doneQueries /
// donePages+sort / facets+doneFacets) em TOP-LEVEL, sem chave `cursor`. Reconstruímos o cursor
// a partir dos campos residuais para não rebentar o resumeLog nem perder o progresso antigo.
const CKPT_BASE_KEYS = new Set(['startedAt', 'ndjson', 'seen', 'stats', 'cursor']);
function legacyCursor(ck: Record<string, unknown>): unknown {
  const rest: Record<string, unknown> = {};
  for (const k of Object.keys(ck)) if (!CKPT_BASE_KEYS.has(k)) rest[k] = ck[k];
  return Object.keys(rest).length ? rest : null;
}

// Dono do seen/append/stats/checkpoint. Cada coletor injeta os buckets via newStats/updateStats.
export function createCrawlWriter<T, S extends { records: number }>(cfg: CrawlWriterConfig<T, S>): CrawlWriter<T, S> {
  const { outDir, source, resume, recordId, newStats, updateStats, resumeLog } = cfg;
  mkdirSync(outDir, { recursive: true });
  const ckptPath = join(outDir, `${source}-checkpoint.json`);

  let startedAt: string, ndjsonPath: string, stats: S, cursor: unknown;
  let seen: Set<string>;
  let resumed = false;
  if (resume && existsSync(ckptPath)) {
    const ck = JSON.parse(readFileSync(ckptPath, 'utf8'));
    startedAt = ck.startedAt; ndjsonPath = ck.ndjson; seen = new Set(ck.seen); stats = ck.stats; cursor = ck.cursor ?? legacyCursor(ck);
    resumed = true;
  } else {
    startedAt = new Date().toISOString().replace(/[:.]/g, '-');
    ndjsonPath = join(outDir, `${source}-${startedAt}.ndjson`);
    seen = new Set(); stats = newStats(); cursor = null;
  }
  const collectedAt = new Date().toISOString();

  let lastCursor = cursor;
  const save = (c?: unknown) => {
    if (c !== undefined) lastCursor = c;
    writeFileSync(ckptPath, JSON.stringify({ startedAt, ndjson: ndjsonPath, seen: [...seen], stats, cursor: lastCursor }));
  };

  const writer: CrawlWriter<T, S> = {
    ndjsonPath, collectedAt, stats, cursor,
    get seenCount() { return seen.size; },
    has(id: string) { return seen.has(id); },
    add(record: T) {
      const id = recordId(record);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      appendFileSync(ndjsonPath, JSON.stringify(record) + '\n');
      updateStats(stats, record);
      return true;
    },
    save,
  };

  if (resumed) {
    console.log(resumeLog ? resumeLog({ stats, cursor, seenCount: seen.size }) : `↻ resume: ${stats.records} registos já recolhidos`);
  }
  return writer;
}

interface PagedCrawlOptions<Q, T, S extends { records: number; pages: number }> {
  writer: CrawlWriter<T, S>;
  queries: Q[];
  cursor: Record<string, number>;      // doneQueries (label → última página feita); writer.cursor ou {}
  maxPages: number;
  cap?: number;                        // limite duro de páginas por query (default: sem limite extra)
  // fetch+parse de uma página; devolve as linhas e (opcional) `last` p/ parar após esta página.
  // null → falha/fim → break desta query. Efeitos por-página (ex. nbResults) ficam aqui.
  fetchPage: (q: Q, page: number, collectedAt: string) => Promise<{ listings: T[]; last?: boolean } | null>;
  labelOf?: (q: Q) => string;          // default q.label
  logLine?: (q: Q, page: number, novos: number, stats: S) => string;   // default canónico
  // Paragem por-página avaliada APÓS o log (ex. `novos === 0` → query esgotada). Preserva os
  // early-breaks baseados em `novos` que alguns coletores usam. Default: nunca para por aqui.
  stop?: (info: { novos: number; page: number; startPage: number }) => boolean;
}

// O loop `for query { for page }` completo. Dedupe/append/stats/checkpoint via `writer`.
export async function runPagedCrawl<Q, T, S extends { records: number; pages: number }>(opts: PagedCrawlOptions<Q, T, S>): Promise<void> {
  const { writer, queries, cursor, maxPages, cap = Number.POSITIVE_INFINITY, fetchPage } = opts;
  const labelOf = opts.labelOf ?? ((q: Q) => (q as { label: string }).label);
  const lastPage = Math.min(maxPages, cap);
  for (const q of queries) {
    const label = labelOf(q);
    const startPage = (cursor[label] || 0) + 1;
    for (let page = startPage; page <= lastPage; page++) {
      const res = await fetchPage(q, page, writer.collectedAt);
      if (!res) break;
      if (!res.listings.length) break;
      let novos = 0;
      for (const r of res.listings) if (writer.add(r)) novos++;
      writer.stats.pages++;
      cursor[label] = page;
      writer.save(cursor);
      console.log(opts.logLine
        ? opts.logLine(q, page, novos, writer.stats)
        : `  ${label} p${page}: +${novos} novos (total ${writer.stats.records})`);
      if (res.last) break;
      if (opts.stop && opts.stop({ novos, page, startPage })) break;
    }
  }
}
