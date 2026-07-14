// caetano/watch.ts — recolha CONTÍNUA (polling) da Caetano. Mesma lógica do autohero/autopt: poll
// de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha) e
// emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o autopt): a API tem `sort=lastVehicleUpdateTime`, mas o `updateTime` é o
// instante de SYNC do feed (não a data de publicação) e o sort não é perfeitamente monotónico. Por
// isso pedimos as primeiras páginas por esse sort (surfa o que foi atualizado há menos tempo) e
// detetamos NOVOS VINs / MUDANÇAS DE PREÇO entre ciclos — que é o sinal que interessa. A captura
// exaustiva de novos depende do re-crawl batch periódico. Logamos o `updateTime` mais recente por
// ciclo como sinal de deriva. Ver research/caetano-investigacao.md.
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo (API JSON própria via http.postSearch) e o marcador `maisRecente` do log.

import { parseSearchResponse, recordId, PAGE_SIZE, SORT_RECENTE } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { CaetanoRecord } from './schema.ts';

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
  return runWatch<CaetanoRecord>({
    http, sourceName: 'caetano', outDir, pages, intervalMs, cycles,
    banner: `watch caetano.pt | ${pages} pág×${PAGE_SIZE} (sort recência)`,
    recordId, unit: 'carros',
    fetchCycle: async ({ nowIso, pages, stopped }) => {
      const rows: CaetanoRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const json = await http.postSearch({ page, numberElements: PAGE_SIZE, sort: SORT_RECENTE, orderBy: 'desc' });
        if (!json) continue;
        const { listings } = parseSearchResponse(json, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maisRecente: string | null = null;
      for (const { record } of seen) {
        if (record.update_time && (maisRecente === null || record.update_time > maisRecente)) maisRecente = record.update_time;
      }
      return ` · tabela ${state.size} · maisRecente ${maisRecente ?? '—'}`;
    },
  });
}
