// flexicar/watch.ts — recolha CONTÍNUA (polling) do flexicar.es. Mesma lógica do autoboerse/autocasion
// watch: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): o SSR do Flexicar não tem sort por data nem `createdAt`.
// O watch usa a ORDEM DEFAULT da página 1 como proxy. O `id` (id de stock crescente = mais recente)
// serve de sinal: logamos o `max(id)` por ciclo para priorizar/detetar deriva. Captura exaustiva de
// novos depende do re-crawl batch periódico. (Como o SSR só devolve 12/URL, `--pages` alarga o ciclo a
// mais facetas: base + as N-1 primeiras marcas.)
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo (loop de facetas) e o marcador `maxId` do log.

import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { FlexicarRecord } from './schema.ts';

const temNext = (t: string) => t.includes('__NEXT_DATA__');
const BASE_PATH = '/coches-segunda-mano/';

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// config: { http, pages (facetas/ciclo, default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;

  // Facetas a sondar por ciclo: base + as (pages-1) primeiras marcas (alarga a superfície de recência).
  let facetas = [BASE_PATH];
  if (pages > 1) {
    const probe = await http.fetchText(`${BASE}${BASE_PATH}`, { validate: temNext });
    const brands = probe ? extractBrandSlugs(probe) : [];
    facetas = [BASE_PATH, ...brands.slice(0, pages - 1).map((s) => `/${s}/segunda-mano/`)];
  }

  return runWatch<FlexicarRecord>({
    http, sourceName: 'flexicar', outDir, pages, intervalMs, cycles,
    banner: `watch flexicar.es | ${facetas.length} faceta(s)/ciclo (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, stopped }) => {
      const rows: FlexicarRecord[] = [];
      for (const path of facetas) {
        if (stopped()) break;
        const html = await http.fetchText(`${BASE}${path}`, { validate: temNext });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maxId: number | null = null;
      for (const { record } of seen) {
        if (record.id != null) maxId = maxId === null ? record.id : Math.max(maxId, record.id);
      }
      return ` · tabela ${state.size} · maxId ${maxId ?? '—'}`;
    },
  });
}
