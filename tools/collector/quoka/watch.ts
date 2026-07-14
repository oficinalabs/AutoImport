// quoka/watch.ts — recolha CONTÍNUA (polling) do quoka.de. Mesma lógica do autoboerse/watch.ts:
// poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL: o sort default do quoka é `date` ("Neueste Anzeigen") e cada card traz
// `listing_date` ("heute HH:MM" para os de hoje). A página 1 são os anúncios mais recentes (à
// parte de ~1 card Premium promovido, fixo no topo e deduplicado pelo id) → deteção de novos
// fiável. Forçamos `?sort=date` para não depender do default.
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { QuokaRecord } from './schema.ts';

const temCards = (t: string) => t.includes('article-item');

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  const qs = new URLSearchParams({ sort: 'date' });
  if (page > 1) qs.set('pag', String(page));
  return `${BASE}/anzeigen/auto-motorrad/automarkt/?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<QuokaRecord>({
    http, sourceName: 'quoka', outDir, pages, intervalMs, cycles,
    banner: `watch quoka.de | ${pages} pág recentes (sort=date)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: QuokaRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temCards });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
