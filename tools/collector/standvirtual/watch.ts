// standvirtual/watch.ts — recolha CONTÍNUA (polling) do standvirtual.com. Mesma lógica do
// autoboerse/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL: pedimos a listagem ordenada por `search[order]=created_at_first:desc`
// (opção "Mais Recentes" do site) — a página 1 são os anúncios acabados de publicar. Cada node
// traz `createdAt` (ISO-8601), por isso o sinal de recência do ciclo = max(listing_created_at).
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo e o marcador de recência (maisRecente) no log.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { StandvirtualRecord } from './schema.ts';

const ORDER = 'created_at_first:desc';
const temAdvertSearch = (t: string) => t.includes('advertSearch');

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  const qs = new URLSearchParams({ 'search[order]': ORDER });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/carros?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<StandvirtualRecord>({
    http, sourceName: 'standvirtual', outDir, pages, intervalMs, cycles,
    banner: `watch standvirtual.com | ${pages} pág recentes`,
    recordId,
    cycleTag: (seen, state) => {
      let maisRecente: string | null = null;
      for (const { record: r } of seen) {
        if (r.listing_created_at && (!maisRecente || r.listing_created_at > maisRecente)) maisRecente = r.listing_created_at;
      }
      return ` · tabela ${state.size} · + recente ${maisRecente || '—'}`;
    },
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: StandvirtualRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(page), { validate: temAdvertSearch });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
