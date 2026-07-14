// olxpt/watch.ts — recolha CONTÍNUA (polling) do olx.pt. Núcleo do polling (estado id→linha,
// novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// ✅ RECÊNCIA REAL: pedimos as primeiras páginas com `?search[order]=created_at:desc` (honrado pelo SSR)
// → os anúncios NOVOS aparecem no topo. Cada anúncio traz `createdTime`; logamos o `max(createdTime)`
// por ciclo como sinal de deriva. (Alguns promovidos são injetados no topo independentemente do sort;
// o estado id→linha dedupe-os.)

import { parseListingPage, listingUrl, recordId, ORDER_RECENTE } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { OlxptRecord } from './schema.ts';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<OlxptRecord>({
    http, sourceName: 'olxpt', outDir, pages, intervalMs, cycles,
    banner: `watch olx.pt | ${pages} pág×52 (sort recência)`,
    recordId,
    // fetchListing vive na subclasse HttpClient do olx.pt → fecha sobre o `http` do config.
    fetchCycle: async ({ nowIso, pages, stopped }) => {
      const rows: OlxptRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchListing(listingUrl({ page, order: ORDER_RECENTE }));
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maisRecente: string | null = null;
      for (const { record } of seen) {
        if (record.created_time && (maisRecente === null || record.created_time > maisRecente)) maisRecente = record.created_time;
      }
      return ` · tabela ${state.size} · maisRecente ${maisRecente ?? '—'}`;
    },
  });
}
