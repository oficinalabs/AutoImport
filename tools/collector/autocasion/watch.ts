// autocasion/watch.ts — recolha CONTÍNUA (polling) do autocasion.com. Núcleo do polling
// (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// ⚠️ RECÊNCIA (como o AutoTrader): o "Ordenar" do autocasion só tem Relevancia + Preço — SEM sort
// por data. O watch usa a ORDEM DEFAULT (Relevancia) da página 1 como proxy. O `identifier` (id
// crescente = mais recente) serve de sinal: logamos o `max(identifier)` por ciclo para priorizar/
// detetar deriva. Captura exaustiva de novos depende do re-crawl batch periódico.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutocasionRecord } from './schema.ts';

const temLd = (t: string) => t.includes('application/ld+json');

function urlRecentes(page: number) {
  return `${BASE}/coches-ocasion${page > 1 ? `?page=${page}` : ''}`;
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
  return runWatch<AutocasionRecord>({
    http, sourceName: 'autocasion', outDir, pages, intervalMs, cycles,
    banner: `watch autocasion.com | ${pages} pág (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutocasionRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temLd });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maxId: number | null = null;
      for (const { record } of seen) {
        if (record.id != null) maxId = maxId === null ? record.id : Math.max(maxId, record.id);
      }
      return ` · tabela ${state.size} · maxId ${maxId ?? '—'}`;
    },
  });
}
