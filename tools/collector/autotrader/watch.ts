// autotrader/watch.ts — recolha CONTÍNUA (polling) do AutoTrader.nl. Núcleo do polling
// (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// ⚠️ RECÊNCIA: o AutoTrader (Scout24) NÃO expõe ordenação por data de publicação (só por
// preço/ano/km/potência/1ª-registo). Usamos `sort=age&desc=1` (1ª-registo mais recente) como
// PROXY de recência — apanha inventário fresco e mudanças de preço no segmento mais recente.
// A captura exaustiva de novos anúncios depende do re-crawl batch periódico.

import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutotraderRecord } from './schema.ts';

const BASE = 'https://www.autotrader.nl';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  const qs = new URLSearchParams({ atype: 'C', sort: 'age', desc: '1' });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/auto/occasions?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<AutotraderRecord>({
    http, sourceName: 'autotrader', outDir, pages, intervalMs, cycles,
    banner: `watch AutoTrader.nl | ${pages} pág recentes`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutotraderRecord[] = [];
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
