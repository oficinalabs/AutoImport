// carplus/watch.ts — recolha CONTÍNUA (polling) do carplus.pt. Mesma lógica do autopt/autocasion:
// poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA: o controlo "Ordenar por" tem "Data Desc." (mais recente primeiro), MAS a ordenação
// por query NÃO é fiável num GET puro (é aplicada via chamada AJAX à API interna; nas probes os
// parâmetros de sort deram resultados inconsistentes/ignorados). O watch usa por isso a ORDEM
// DEFAULT da página 1 como PROXY e, adicionalmente, aproveita o campo `update_time` de cada viatura
// (timestamp de atualização no feed) como sinal de recência: loga o `max(update_time)` do ciclo para
// medir deriva. A captura exaustiva de novos depende do re-crawl batch periódico (o catálogo tem só
// ~1k viaturas, portanto um `run --full` completo é barato). (Mesma decisão do autopt/autocasion.)
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo e o marcador `maxUpdate` do log.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { CarplusRecord } from './schema.ts';

const temPayload = (t: string) => t.includes('__NUXT_DATA__');

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  return `${BASE}/carros-usados/${page > 1 ? `?page=${page}` : ''}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<CarplusRecord>({
    http, sourceName: 'carplus', outDir, pages, intervalMs, cycles,
    banner: `watch carplus.pt | ${pages} pág (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: CarplusRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temPayload });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maxUpd: string | null = null;
      for (const { record } of seen) {
        if (record.update_time && (maxUpd === null || record.update_time > maxUpd)) maxUpd = record.update_time;
      }
      return ` · tabela ${state.size} · maxUpdate ${maxUpd || '—'}`;
    },
  });
}
