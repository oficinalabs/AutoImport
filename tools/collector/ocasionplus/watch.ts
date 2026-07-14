// ocasionplus/watch.ts — recolha CONTÍNUA (polling) do ocasionplus.com. Mesma lógica do
// autocasion/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela"
// de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): o "Ordenar" do OcasionPlus é por query `?sort=`, que o
// robots.txt PROÍBE — logo não o usamos. A listagem default vem por `itemListOrder: Relevance` e o
// id é um token alfanumérico (NÃO crescente por data), pelo que não há sinal numérico de recência.
// O watch usa a ORDEM DEFAULT da página 1 como proxy e loga o `id` do topo por ciclo (marcador de
// deriva). Captura exaustiva de novos depende do re-crawl batch periódico.
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo e o marcador `topo` (id do topo da página 1 = seen[0]).

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OcasionplusRecord } from './schema.ts';

const temVehicle = (t: string) => t.includes('"@type":"Vehicle"');

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  return `${BASE}/coches-segunda-mano${page > 1 ? `?page=${page}` : ''}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<OcasionplusRecord>({
    http, sourceName: 'ocasionplus', outDir, pages, intervalMs, cycles,
    banner: `watch ocasionplus.com | ${pages} pág (ordem default)`,
    recordId,
    // id do topo da página 1 = marcador de deriva
    cycleTag: (seen, state) => ` · tabela ${state.size} · topo ${seen[0]?.id ?? '—'}`,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: OcasionplusRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temVehicle });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
