// custojusto/watch.ts — recolha CONTÍNUA (polling) do CustoJusto.pt. Mesma lógica do
// autoboerse/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela"
// de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL: o CustoJusto ordena por omissão por data de publicação (SORT_DESC_PUBLISH_DATE)
// e cada anúncio traz `listTime` (ISO). A 1ª página da listagem base são os anúncios mais recentes →
// deteção de novos fiável.
//
// ⚠️ SEM PAGINAÇÃO: `?o=N` está robots-proibido, por isso NÃO paginamos — cada ciclo lê a 1ª página
// da listagem base (40 anúncios mais recentes). Para não perder novos entre ciclos, o intervalo deve
// ser ≤ tempo típico de 40 novas publicações. A captura exaustiva depende do re-crawl batch (--full).
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo (1 página, sem paginação) e o marcador `último` do log (antes de `tabela`).

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { CustojustoRecord } from './schema.ts';

const URL_RECENTES = `${BASE}/portugal/veiculos/carros-usados`;   // default sort = data desc

interface WatchConfig {
  http: HttpClient;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// config: { http, intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<CustojustoRecord>({
    http, sourceName: 'custojusto', outDir, intervalMs, cycles,
    banner: `watch custojusto.pt | listagem base (data desc)`,
    recordId,
    fetchCycle: async ({ http, nowIso }) => {
      const html = await http.fetchText(URL_RECENTES, { validate: (t) => t.includes('__NEXT_DATA__') });
      if (!html) return [];
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      return listings;
    },
    cycleTag: (seen, state) => {
      let maxTime: string | null = null;
      for (const { record } of seen) {
        if (record.listing_created_at && (!maxTime || record.listing_created_at > maxTime)) maxTime = record.listing_created_at;
      }
      return ` · último ${maxTime || '?'} · tabela ${state.size}`;
    },
  });
}
