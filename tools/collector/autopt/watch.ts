// autopt/watch.ts — recolha CONTÍNUA (polling) do auto.pt. Mesma lógica do autocasion/watch.ts:
// poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): o "Ordenar" tem a opção "Data Anúncio", MAS os
// filtros/ordenação por query (`?search[...]`, `?sortBy=`) NÃO funcionam num GET puro (devolvem 500
// ou são ignorados — a ordenação é aplicada via LiveComponent AJAX). O watch usa por isso a ORDEM
// DEFAULT ("Destacados") da página 1 como PROXY: deteta novos/preço entre ciclos. A captura
// exaustiva de novos depende do re-crawl batch periódico. (Ver research/autopt-investigacao.md.)

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { AutoptRecord } from './schema.ts';

const temCards = (t: string) => t.includes('car_listing_entry');

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  return `${BASE}/carros-usados${page > 1 ? `?page=${page}` : ''}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<AutoptRecord>({
    http, sourceName: 'autopt', outDir, pages, intervalMs, cycles,
    banner: `watch auto.pt | ${pages} pág (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutoptRecord[] = [];
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
