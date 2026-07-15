// autouncle/watch.ts — recolha CONTÍNUA (polling) de UM mercado AutoUncle (--market, default pt).
// Mesma lógica do aramisauto/autotrader: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO,
// mantém uma "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
// Estado/sink por mercado (`autouncle-{code}-*`).
//
// ⚠️ RECÊNCIA (proxy, honesto): o AutoUncle NÃO permite ordenar por data — o robots proíbe os SRP
// com `s[order_by]=` (e qualquer `s[...]=`). Não há, pois, um "mais recentes primeiro" acessível. O
// watch faz poll das primeiras páginas na ordem default (relevância/preço) e deteta novos/preço por
// carId — a captura exaustiva de novos anúncios depende do re-crawl batch periódico. Como SINAL de
// deriva logamos o `days_on_market` (laytime) MÍNIMO visto por ciclo (menos dias = anúncio mais fresco).

import { parseListingPage, listingUrl, recordId } from './parse.ts';
import { MARKETS, marketSourceSite, type Market } from './http.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { AutouncleRecord } from './schema.ts';

interface WatchConfig {
  http: HttpClient;
  market?: Market;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  brand?: string | null;
  outDir: string;
}

// config: { http, market (default pt), pages (default 1), intervalMs (default 60000),
//           cycles (0=infinito), brand?, outDir }
export async function watch(config: WatchConfig) {
  const { market = MARKETS.pt, pages = 1, intervalMs = 60000, cycles = 0, brand = null, outDir } = config;
  const http = config.http.forMarket(market);
  return runWatch<AutouncleRecord>({
    http, sourceName: `autouncle-${market.code}`, outDir, pages, intervalMs, cycles,
    banner: `watch ${marketSourceSite(market)}${brand ? ` [${brand}]` : ''} | ${pages} pág×25 (ordem default)`,
    recordId,
    cycleTag: (seen, state) => {
      let minDias: number | null = null;
      for (const { record } of seen) {
        if (record.days_on_market != null && (minDias === null || record.days_on_market < minDias)) minDias = record.days_on_market;
      }
      return ` · tabela ${state.size} · minDias ${minDias ?? '—'}`;
    },
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutouncleRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(listingUrl({ market, brand, page }), { validate: (t) => t.includes('"@type":"ItemList"') });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso, forcedMake: brand, market });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
