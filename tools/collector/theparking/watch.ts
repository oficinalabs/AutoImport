// watch.ts — recolha CONTÍNUA (polling) da página de anúncios mais recentes.
//
// PORQUÊ funciona: no theparking.eu a ordenação por defeito é por data (`cur_trie:date`),
// logo a PÁGINA 1 de qualquer query = os anúncios mais recentes. Fazendo poll da página 1
// de X em X tempo e comparando com o que já vimos, apanhamos:
//   - anúncios NOVOS (id nunca visto)          -> evento 'new'
//   - anúncios com PREÇO ALTERADO (id visto)    -> evento 'price_change'
// Tudo o resto é ignorado (só atualiza o last_seen).
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo. Outlier: o id não vem no registo (recordId deriva-o) → `embedId: true` para o
// guardar na linha, como antes.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { TheparkingRecord } from './schema.ts';

interface WatchConfig {
  http: HttpClient;
  countries: string[];
  make?: string | null;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlDaPagina(queryPath: string, page: number) {
  return page === 1
    ? `${BASE}/used-cars/${queryPath}.html`
    : `${BASE}/used-cars/${queryPath}/${page}.html`;
}

// config: http, countries[], make?, pages (default 1 = só recentes), intervalMs, cycles (0=∞), outDir.
export async function watch(config: WatchConfig) {
  const { http, countries, make = null, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  const queries = countries.map((c) => (make ? `${c}/${make}` : c));
  return runWatch<TheparkingRecord>({
    http, sourceName: 'theparking', outDir, pages, intervalMs, cycles,
    banner: `watch: ${queries.join(', ')} | ${pages} pág/query`,
    recordId, embedId: true,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: TheparkingRecord[] = [];
      for (const q of queries) {
        for (let page = 1; page <= pages && !stopped(); page++) {
          // validate: página tem de trazer anúncios; senão é o Cloudflare a devolver 200 vazio
          // (rate-limit intermitente) → o http faz retry.
          const html = await http.fetchText(urlDaPagina(q, page), { validate: (t) => t.includes('"@type": "Vehicle"') });
          if (!html) continue;
          rows.push(...parseListingPage(html, { collectedAt: nowIso }));
        }
      }
      return rows;
    },
  });
}
