// autosapo/watch.ts — recolha CONTÍNUA (polling) do auto.sapo.pt. Mesma lógica dos outros
// coletores: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado
// (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA: o `orderby=1` ("Mais recente") é HONRADO pelo SSR — as viaturas NÃO promovidas vêm
// por data de publicação DESCENDENTE. A 1ª página é toda "Em destaque" (promovidos, que flutuam ao
// topo), mas a partir da pág. 2-3 surgem os anúncios genuinamente recentes. Por isso o watch pede as
// PRIMEIRAS PÁGINAS por `orderby=1` (default 3) e apanha os novos aí. Sinal de deriva = o
// `published_at` mais recente do ciclo — descodificado do ObjectId (o timestamp está embutido nele),
// pelo que temos data REAL de publicação por anúncio, sem depender de nenhum campo do cartão.

import { BASE } from './http.ts';
import {
  LISTING_PATH, BRANDS_SITEMAP, ORDER_RECENTE, parseListingPage, recordId, temCartoes, extractBrandSlugs,
} from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from './http.ts';
import type { AutosapoRecord } from './schema.ts';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlListagem(page: number) {
  return `${BASE}${LISTING_PATH}?p=${page}&orderby=${ORDER_RECENTE}`;
}

// config: { http, pages (default 3), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 3, intervalMs = 60000, cycles = 0, outDir } = config;

  // Taxonomia de marcas (1 pedido) para separar marca/modelo.
  const brandXml = await http.fetchText(BASE + BRANDS_SITEMAP);
  const brandSet = extractBrandSlugs(brandXml || '');

  return runWatch<AutosapoRecord>({
    http, sourceName: 'autosapo', outDir, pages, intervalMs, cycles,
    banner: `watch auto.sapo.pt | ${pages} pág×20 (orderby=recente)`,
    recordId,
    cycleTag: (seen, state) => {
      let maisRecente: string | null = null;
      for (const { record } of seen) {
        const pub = record.published_at;
        if (pub && (maisRecente === null || pub > maisRecente)) maisRecente = pub;
      }
      return ` · tabela ${state.size} · maisRecente ${maisRecente ?? '—'}`;
    },
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutosapoRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlListagem(page), { validate: temCartoes });
        if (!html) continue;
        const { listings } = parseListingPage(html, { brandSet, collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
