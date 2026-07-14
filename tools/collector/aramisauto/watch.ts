// aramisauto/watch.ts — recolha CONTÍNUA (polling) do aramisauto.com. Núcleo do polling
// (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// ⚠️ RECÊNCIA (como o AutoTrader/Autocasión): o aramisauto NÃO expõe sort por data — e o robots
// proíbe `/*sort=*` / `/*orderBy`. O watch usa a ORDEM DEFAULT da página 1 de `/achat/` como proxy.
// O `vehicleId` (id numérico crescente = entrada mais recente no catálogo) serve de sinal: logamos
// o `max(vehicleId)` por ciclo para priorizar/detetar deriva. Captura exaustiva de novos depende do
// re-crawl batch periódico.

import { BASE } from './http.ts';
import { parseListingPage, recordId, temNuxt } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AramisautoRecord } from './schema.ts';

function urlRecentes(page: number) {
  return `${BASE}/achat/${page > 1 ? `?page=${page}` : ''}`;
}

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
  return runWatch<AramisautoRecord>({
    http, sourceName: 'aramisauto', outDir, pages, intervalMs, cycles,
    banner: `watch aramisauto.com | ${pages} pág (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AramisautoRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temNuxt });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maxId: number | null = null;
      for (const { record } of seen) {
        const idNum = Number(record.id);
        if (Number.isFinite(idNum)) maxId = maxId === null ? idNum : Math.max(maxId, idNum);
      }
      return ` · tabela ${state.size} · maxId ${maxId ?? '—'}`;
    },
  });
}
