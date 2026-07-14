// meinauto/watch.ts — recolha CONTÍNUA (polling) do meinauto.de. Mesma lógica do autoboerse/
// watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado
// (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL (como o autoboerse, ao contrário do AutoTrader/aramisauto): o meinauto ordena por
// data de criação — `sortBy=createdAt&order=desc` — E cada anúncio traz `createdAt` (guardado como
// `listing_created_at`). A página 1 ordenada por data são os anúncios mais recentes → deteção de
// novos fiável (verificado: topo da p1 com timestamps do próprio dia, em ordem decrescente).
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo.

import { BASE } from './http.ts';
import { parseListingPage, temNuxtData, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { MeinautoRecord } from './schema.ts';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// Usados (PRE_OWNED), ordenados por data de criação decrescente (mais recentes primeiro).
function urlRecentes(page: number) {
  const qs = new URLSearchParams({ conditionCategories: 'PRE_OWNED', sortBy: 'createdAt', order: 'desc' });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/fahrzeugsuche/?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<MeinautoRecord>({
    http, sourceName: 'meinauto', outDir, pages, intervalMs, cycles,
    banner: `watch meinauto.de | ${pages} pág recentes (sortBy=createdAt)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: MeinautoRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temNuxtData });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
