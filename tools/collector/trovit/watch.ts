// trovit/watch.ts — recolha CONTÍNUA (polling) do coches.trovit.es. Mesma lógica do
// autoboerse/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL: o Trovit tem sort por data — `?order_by=source_date` ("Fecha (más recientes)").
// A página 1 ordenada por data traz os anúncios mais frescos primeiro (nas probes, o topo dizia
// "Hace 4 h") → deteção de novos fiável. Cada card traz ainda "Hace 21 h 21 minutos"
// (updated_ago_min) → logamos o MÍNIMO por ciclo como sinal de frescura.
//
// Nota (agregador sem página "todos"): o Trovit não tem feed único de todos os coches; o watch
// vigia UM slug (default: `madrid`, a maior cidade → feed denso e diverso). Para vigiar o país
// inteiro, correr vários watchers com --slug distintos (marca/cidade).
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo e o marcador de frescura (maisFresco) no log.

import { BASE } from './http.ts';
import { parseListingPage, recordId, DEFAULT_SLUG } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { TrovitRecord } from './schema.ts';

const temCards = (t: string) => t.includes('item-cars-snippet');

interface WatchConfig {
  http: HttpClient;
  slug?: string;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// URL de recentes: slug + paginação no path + `?order_by=source_date` (mais recentes primeiro).
function urlRecentes(slug: string, page: number) {
  return `${BASE}/coches/${slug}${page > 1 ? `/${page}` : ''}?order_by=source_date`;
}

// config: { http, slug, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, slug = DEFAULT_SLUG, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  return runWatch<TrovitRecord>({
    http, sourceName: 'trovit', outDir, pages, intervalMs, cycles,
    banner: `watch coches.trovit.es | slug "${slug}" | ${pages} pág (sort por data)`,
    recordId,
    cycleTag: (seen, state) => {
      let maisFresco: number | null = null;
      for (const { record: r } of seen) {
        if (r.updated_ago_min != null) maisFresco = maisFresco === null ? r.updated_ago_min : Math.min(maisFresco, r.updated_ago_min);
      }
      return ` · tabela ${state.size} · mais fresco ${maisFresco != null ? `${maisFresco} min` : '—'}`;
    },
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: TrovitRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(slug, page), { validate: temCards });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
      }
      return rows;
    },
  });
}
