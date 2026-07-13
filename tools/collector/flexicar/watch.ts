// flexicar/watch.ts — recolha CONTÍNUA (polling) do flexicar.es. Mesma lógica do autoboerse/autocasion
// watch: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): o SSR do Flexicar não tem sort por data nem `createdAt`.
// O watch usa a ORDEM DEFAULT da página 1 como proxy. O `id` (id de stock crescente = mais recente)
// serve de sinal: logamos o `max(id)` por ciclo para priorizar/detetar deriva. Captura exaustiva de
// novos depende do re-crawl batch periódico. (Como o SSR só devolve 12/URL, `--pages` alarga o ciclo a
// mais facetas: base + as N-1 primeiras marcas.)

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, extractBrandSlugs, recordId } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from '../lib/http.ts';
import type { FlexicarRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const temNext = (t: string) => t.includes('__NEXT_DATA__');
const BASE_PATH = '/coches-segunda-mano/';

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = FlexicarRecord & { first_seen: string; last_seen: string };

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
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'flexicar-state.json');
  const sink = new Sink(outDir, 'flexicar');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  // Facetas a sondar por ciclo: base + as (pages-1) primeiras marcas (alarga a superfície de recência).
  let facetas = [BASE_PATH];
  if (pages > 1) {
    const probe = await http.fetchText(`${BASE}${BASE_PATH}`, { validate: temNext });
    const brands = probe ? extractBrandSlugs(probe) : [];
    facetas = [BASE_PATH, ...brands.slice(0, pages - 1).map((s) => `/${s}/segunda-mano/`)];
  }

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch flexicar.es | ${facetas.length} faceta(s)/ciclo (ordem default) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;
    let maxId: number | null = null;

    for (const path of facetas) {
      if (stop) break;
      const html = await http.fetchText(`${BASE}${path}`, { validate: temNext });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (r.id != null) maxId = maxId === null ? r.id : Math.max(maxId, r.id);
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
