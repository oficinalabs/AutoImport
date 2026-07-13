// santogal/watch.ts — recolha CONTÍNUA (polling) do santogal.pt. Mesma lógica do autopt/watch.ts:
// poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha)
// e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o autopt/autocasion): o "Ordenar por" só tem Marca/Preço/Ano/Quilómetros —
// SEM ordenação por data (e os params de ordenação/faceta são aplicados via JS, não por GET). O
// watch usa por isso a ORDEM DEFAULT ("destaque") da página 1 como PROXY: deteta novos/preço entre
// ciclos. O `carroId` é um id de stock crescente → logamos o `max(carroId)` por ciclo como sinal
// de deriva/recência. A captura exaustiva de novos depende do re-crawl batch periódico.
// (Ver research/santogal-investigacao.md.)

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from '../lib/http.ts';
import type { SantogalRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const temCards = (t: string) => t.includes('card_car');

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = SantogalRecord & { first_seen: string; last_seen: string };

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  return `${BASE}/pt/search-page/?querytext=Usados&vehicletype=car${page > 1 ? `&pagina=${page}` : ''}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'santogal-state.json');
  const sink = new Sink(outDir, 'santogal');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch santogal.pt | ${pages} pág (ordem default) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0, maxId = 0;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlRecentes(page), { validate: temCards });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        const n = Number(r.id); if (Number.isFinite(n) && n > maxId) maxId = n;
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
      + ` · maxCarroId ${maxId || '—'} · tabela ${state.size} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
