// autoscout24/watch.ts — recolha CONTÍNUA (polling) do AutoScout24. Mesma lógica do
// autotrader/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL: ao contrário do autotrader.nl, o AutoScout24 EXPÕE ordenação por data de
// publicação — `sort=age&desc=1` ("Neueste Angebote zuerst" = mais recentes primeiro) e ainda
// um filtro `onlineSince` (1–14 dias). Usamo-la: o watch apanha inventário GENUINAMENTE novo
// (não só um proxy). Confirmado ao vivo — ver research/autoscout24-investigacao.md.

import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { Autoscout24Record } from './schema.ts';

const BASE = 'https://www.autoscout24.de';
const validate = (t: string) => t.includes('__NEXT_DATA__');

// Marca no watch: só precisamos do slug ou do id (mmvmk0).
interface MakeArg { slug: string | null; id: string | null }

interface WatchConfig {
  http: HttpClient;
  countries?: (string | null)[];
  make?: MakeArg | null;
  pages?: number;
  size?: number;
  intervalMs?: number;
  cycles?: number;
  onlineSince?: number | null;
  outDir: string;
}

// Parâmetros do URL de recentes.
interface RecentesParams {
  cy: string | null;
  slug: string | null;
  makeId: string | null;
  size: number;
  page: number;
  onlineSince: number | null;
}

// URL de recentes: sort=age&desc=1 (publicação mais recente primeiro), opcionalmente por
// país (cy) e marca (slug ou mmvmk0).
function urlRecentes({ cy, slug, makeId, size, page, onlineSince }: RecentesParams) {
  const path = slug ? `/lst/${slug}` : '/lst';
  const qs = new URLSearchParams({ sort: 'age', desc: '1', size: String(size) });
  if (cy) qs.set('cy', cy);
  if (makeId && !slug) qs.set('mmvmk0', String(makeId));
  if (onlineSince) qs.set('onlineSince', String(onlineSince));
  if (page && page > 1) qs.set('page', String(page));
  return `${BASE}${path}?${qs}`;
}

// config: { http, countries[] (default [null]), make {slug,id}|null, pages, size, intervalMs,
//           cycles (0=infinito), onlineSince|null, outDir }
export async function watch(config: WatchConfig) {
  const {
    http, countries = [null], make = null, pages = 1, size = 20,
    intervalMs = 60000, cycles = 0, onlineSince = null, outDir,
  } = config;

  const cyList = countries.length ? countries : [null];
  return runWatch<Autoscout24Record>({
    http, sourceName: 'autoscout24', outDir, pages, intervalMs, cycles,
    banner: `watch AutoScout24 | ${cyList.map((c) => c || 'ALL').join(',')}`
      + `${make ? ` | ${make.slug || make.id}` : ''} | ${pages} pág recentes (sort=age)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: Autoscout24Record[] = [];
      for (const cy of cyList) {
        for (let page = 1; page <= pages && !stopped(); page++) {
          const url = urlRecentes({ cy, slug: make?.slug || null, makeId: make?.id || null, size, page, onlineSince });
          const html = await http.fetchText(url, { validate });
          if (!html) continue;
          const { listings } = parseListingPage(html, { collectedAt: nowIso });
          rows.push(...listings);
        }
      }
      return rows;
    },
  });
}
