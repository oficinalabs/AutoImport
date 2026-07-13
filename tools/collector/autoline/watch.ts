// autoline/watch.ts — recolha CONTÍNUA (polling) do autoline.pt. Mesma lógica do
// autocasion/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// RECÊNCIA: o robots proíbe `?sort=` (`Disallow: /-/*sort=`) → SEM ordenação por data na URL. O
// watch usa a ORDEM DEFAULT da página 1 do país como proxy. BÓNUS vs. AutoTrader/autocasion: o
// `id` (data-code) É um timestamp de criação (YYMMDDHHMMSS+…), descodificado em `created_at` pelo
// schema — sinal de recência REAL. Logamos o `max(id)` por ciclo (id lexicograficamente maior =
// mais recente). Captura exaustiva de novos depende do re-crawl batch periódico.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from '../lib/http.ts';
import type { AutolineRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const temItemList = (t: string) => t.includes('ItemList');

const CAT = { slug: 'carros', id: 1169 };
const SLUG_PT: Record<string, string> = { BE: 'Belgica', DE: 'Alemanha', ES: 'Espanha', FR: 'Franca', GB: 'Gra-Bretanha', CH: 'Suica' };

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = AutolineRecord & { first_seen: string; last_seen: string };

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
  mkdirSync(outDir, { recursive: true });
  const cc = String(country).toUpperCase();
  const slug = SLUG_PT[cc] || cc;
  const statePath = join(outDir, 'autoline-state.json');
  const sink = new Sink(outDir, 'autoline');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch autoline.pt | carros ${cc} | ${pages} pág (ordem default) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0, maxId: string | null = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlRecentes(cc, slug, page), { validate: temItemList });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso, countryCode: cc });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (maxId === null || String(id) > String(maxId)) maxId = id;
        const prev = state.get(id);
        if (!prev) {
          const row = { ...r, first_seen: nowIso, last_seen: nowIso };
          state.set(id, row); await sink.upsert(row, 'new'); novos++;
        } else if (prev.price !== r.price) {
          const row = { ...r, first_seen: prev.first_seen, last_seen: nowIso };
          state.set(id, row); await sink.upsert(row, 'price_change'); alterados++;
        } else {
          prev.last_seen = nowIso;
        }
      }
    }

    saveState();
    console.log(`[ciclo ${cycle}] ${nowIso} — vistos ${vistos} · novos ${novos} · preço↑↓ ${alterados}`
      + ` · tabela ${state.size} · maxId ${maxId ?? '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
