// autoboerse/watch.ts — recolha CONTÍNUA (polling) do autoboerse.de. Núcleo do polling
// (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// ✅ RECÊNCIA REAL: ao contrário do AutoTrader, o autoboerse ordena por data de publicação
// (?orderBy=date — de facto o default) E cada anúncio traz `createdAt`. A página 1 ordenada
// por data são os anúncios mais recentes → deteção de novos fiável.

import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutoboerseRecord } from './schema.ts';

const BASE = 'https://autoboerse.de';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  const qs = new URLSearchParams({ orderBy: 'date' });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/fahrzeugsuche?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<AutoboerseRecord>({
    http, sourceName: 'autoboerse', outDir, pages, intervalMs, cycles,
    banner: `watch autoboerse.de | ${pages} pág recentes`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutoboerseRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: (t) => t.includes('__NEXT_DATA__') });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
