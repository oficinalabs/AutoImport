// autohero/watch.ts — recolha CONTÍNUA (polling) do autohero.com. Núcleo do polling
// (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// ✅ RECÊNCIA REAL (vantagem sobre aramisauto/autotrader): a API tem o sort `newest_eligible`
// (determinístico, por data de publicação/elegibilidade) e cada anúncio traz `firstPublishedAt`. O
// watch pede as primeiras páginas por esse sort → os anúncios NOVOS aparecem no topo. Logamos o
// `firstPublishedAt` mais recente por ciclo como sinal de deriva.
//
// Outlier: o fetch é POST GraphQL → usamos o `http` do config (subclasse com `postGraphql`), não o
// `http` genérico do contexto do fetchCycle (que só expõe o GET da base).

import { buildVariables, parseAdsResponse, recordId, LIMIT_MAX, SORT_RECENTE } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { AutoheroRecord } from './schema.ts';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<AutoheroRecord>({
    http, sourceName: 'autohero', outDir, pages, intervalMs, cycles,
    banner: `watch autohero.com | ${pages} pág×${LIMIT_MAX} (sort recência)`,
    recordId,
    fetchCycle: async ({ nowIso, pages, stopped }) => {
      const rows: AutoheroRecord[] = [];
      for (let page = 0; page < pages && !stopped(); page++) {
        const ads = await http.postGraphql(buildVariables({ offset: page * LIMIT_MAX, limit: LIMIT_MAX, sort: SORT_RECENTE }));
        if (!ads) continue;
        const { listings } = parseAdsResponse(ads, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maisRecente: string | null = null;
      for (const { record } of seen) {
        const pub = record.listing_first_published_at;
        if (pub && (maisRecente === null || pub > maisRecente)) maisRecente = pub;
      }
      return ` · tabela ${state.size} · maisRecente ${maisRecente ?? '—'}`;
    },
  });
}
