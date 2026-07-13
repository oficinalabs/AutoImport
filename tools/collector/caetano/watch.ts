// caetano/watch.ts — recolha CONTÍNUA (polling) da Caetano. Mesma lógica do autohero/autopt: poll
// de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha) e
// emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o autopt): a API tem `sort=lastVehicleUpdateTime`, mas o `updateTime` é o
// instante de SYNC do feed (não a data de publicação) e o sort não é perfeitamente monotónico. Por
// isso pedimos as primeiras páginas por esse sort (surfa o que foi atualizado há menos tempo) e
// detetamos NOVOS VINs / MUDANÇAS DE PREÇO entre ciclos — que é o sinal que interessa. A captura
// exaustiva de novos depende do re-crawl batch periódico. Logamos o `updateTime` mais recente por
// ciclo como sinal de deriva. Ver research/caetano-investigacao.md.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSearchResponse, recordId, PAGE_SIZE, SORT_RECENTE } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from './http.ts';
import type { CaetanoRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = CaetanoRecord & { first_seen: string; last_seen: string };

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
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'caetano-state.json');
  const sink = new Sink(outDir, 'caetano');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch caetano.pt | ${pages} pág×${PAGE_SIZE} (sort recência) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0, maisRecente: string | null = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const json = await http.postSearch({ page, numberElements: PAGE_SIZE, sort: SORT_RECENTE, orderBy: 'desc' });
      if (!json) continue;
      const { listings } = parseSearchResponse(json, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (r.update_time && (maisRecente === null || r.update_time > maisRecente)) maisRecente = r.update_time;
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
      + ` · tabela ${state.size} · maisRecente ${maisRecente ?? '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} carros · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
