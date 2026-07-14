// autoline/watch.ts — recolha CONTÍNUA (polling) do autoline.pt. Núcleo do polling
// (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o fetch do ciclo.
//
// RECÊNCIA: o robots proíbe `?sort=` (`Disallow: /-/*sort=`) → SEM ordenação por data na URL. O
// watch usa a ORDEM DEFAULT da página 1 do país como proxy. BÓNUS vs. AutoTrader/autocasion: o
// `id` (data-code) É um timestamp de criação (YYMMDDHHMMSS+…), descodificado em `created_at` pelo
// schema — sinal de recência REAL. Logamos o `max(id)` por ciclo (id lexicograficamente maior =
// mais recente). Captura exaustiva de novos depende do re-crawl batch periódico.

import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutolineRecord } from './schema.ts';

const temItemList = (t: string) => t.includes('ItemList');

const CAT = { slug: 'carros', id: 1169 };
const SLUG_PT: Record<string, string> = { BE: 'Belgica', DE: 'Alemanha', ES: 'Espanha', FR: 'Franca', GB: 'Gra-Bretanha', CH: 'Suica' };

interface WatchConfig {
  http: HttpClient;
  country?: string;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(cc: string, slug: string, page: number) {
  const seg = `/-/${CAT.slug}/${slug}--c${CAT.id}cnt${cc}`;
  return `${BASE}${seg}${page > 1 ? `?page=${page}` : ''}`;
}

// config: { http, country (default 'BE'), pages (default 1), intervalMs (default 60000),
//           cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, country = 'BE', pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  const cc = String(country).toUpperCase();
  const slug = SLUG_PT[cc] || cc;
  return runWatch<AutolineRecord>({
    http, sourceName: 'autoline', outDir, pages, intervalMs, cycles,
    banner: `watch autoline.pt | carros ${cc} | ${pages} pág (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: AutolineRecord[] = [];
      for (let page = 1; page <= pages && !stopped(); page++) {
        const html = await http.fetchText(urlRecentes(cc, slug, page), { validate: temItemList });
        if (!html) continue;
        const { listings } = parseListingPage(html, { collectedAt: nowIso, countryCode: cc });
        rows.push(...listings);
      }
      return rows;
    },
    cycleTag: (seen, state) => {
      let maxId: string | null = null;
      for (const { id } of seen) {
        if (maxId === null || String(id) > String(maxId)) maxId = id;
      }
      return ` · tabela ${state.size} · maxId ${maxId ?? '—'}`;
    },
  });
}
