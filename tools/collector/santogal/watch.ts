// santogal/watch.ts — recolha CONTÍNUA (polling) do santogal.pt. Mesma lógica do autopt/watch.ts:
// poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o autopt/autocasion): o "Ordenar por" só tem Marca/Preço/Ano/Quilómetros —
// SEM ordenação por data (e os params de ordenação/faceta são aplicados via JS, não por GET). O
// watch usa por isso a ORDEM DEFAULT ("destaque") da página 1 como PROXY: deteta novos/preço entre
// ciclos. O `carroId` é um id de stock crescente → logamos o `max(carroId)` por ciclo como sinal
// de deriva/recência. A captura exaustiva de novos depende do re-crawl batch periódico.
// (Ver research/santogal-investigacao.md.)
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo e o marcador maxCarroId no log.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { SantogalRecord } from './schema.ts';

const temCards = (t: string) => t.includes('card_car');

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  return `${BASE}/pt/search-page/?querytext=Usados&vehicletype=car${page > 1 ? `&pagina=${page}` : ''}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<SantogalRecord>({
    http, sourceName: 'santogal', outDir, pages, intervalMs, cycles,
    banner: `watch santogal.pt | ${pages} pág (ordem default)`,
    recordId,
    cycleTag: (seen, state) => {
      let maxId = 0;
      for (const { record: r } of seen) {
        const n = Number(r.id); if (Number.isFinite(n) && n > maxId) maxId = n;
      }
      return ` · maxCarroId ${maxId || '—'} · tabela ${state.size}`;
    },
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: SantogalRecord[] = [];
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
