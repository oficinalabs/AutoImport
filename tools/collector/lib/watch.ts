// lib/watch.ts — event-core partilhado da recolha CONTÍNUA (polling) dos coletores.
//
// PORQUÊ: 23 dos 24 `watch.ts` tinham o MESMO núcleo, byte-a-byte: carregar/guardar o estado
// (Map id→linha), ramos `new`/`price_change`/`last_seen`, `sink.upsert`, SIGINT, sleep fatiado,
// log de ciclo, log final. Só variava (a) o FETCH do ciclo e (b) um marcador cosmético de
// recência no log (maisRecente/maxId/topo/…). Aqui vive esse núcleo; o coletor fornece só o
// `fetchCycle` (o seam único) e, quando aplicável, o `cycleTag` (marcador do log).
//
// Garantia de forma: runWatch NÃO toca em parse.ts/schema.ts — as linhas do ciclo são os mesmos
// registos normalizados; o risco fica na orquestração (dedupe/estado/eventos), não na forma.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Sink } from './sink.ts';
import type { HttpClient } from './http.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Linha de estado = registo + (opcional) id embebido + marcas temporais de observação.
export type WatchRow<T> = T & { id?: string; first_seen: string; last_seen: string };

// Contexto passado ao `fetchCycle`: o coletor faz o fetch (qualquer transporte) e devolve as
// linhas normalizadas do ciclo. `stopped()` permite abortar cedo o loop interno em SIGINT.
export interface FetchCycleCtx {
  http: HttpClient;
  nowIso: string;
  pages: number;
  stopped: () => boolean;
}

// Item processado (registo com id válido), na ordem em que foi visto — base do `cycleTag`.
export interface SeenItem<T> { record: T; id: string; }

export interface RunWatchOptions<T extends { price?: unknown }> {
  http: HttpClient;
  sourceName: string;                       // prefixo do estado (`<source>-state.json`) e do sink
  outDir: string;
  pages?: number;
  intervalMs?: number;
  cycles?: number;                          // 0 = contínuo
  banner: string;                           // descritor entre "▶ " e " | intervalo …"
  fetchCycle: (ctx: FetchCycleCtx) => Promise<T[]>;
  recordId: (record: T) => string | null | undefined;
  embedId?: boolean;                        // theparking: guardar o id na própria linha
  // Segmento central do log do ciclo, calculado a partir das linhas vistas. Default: ` · tabela N`.
  cycleTag?: (seen: SeenItem<T>[], state: Map<string, WatchRow<T>>) => string;
  unit?: string;                            // substantivo da linha final (default 'anúncios')
  sink?: Sink;
}

function buildRow<T>(r: T, id: string, firstSeen: string, lastSeen: string, embedId: boolean): WatchRow<T> {
  return embedId
    ? { ...r, id, first_seen: firstSeen, last_seen: lastSeen }
    : { ...r, first_seen: firstSeen, last_seen: lastSeen };
}

// Loop de polling genérico. O coletor só fornece `fetchCycle` (+ `cycleTag` se tiver marcador).
export async function runWatch<T extends { price?: unknown }>(opts: RunWatchOptions<T>): Promise<{ total: number }> {
  const { http, sourceName, outDir, pages = 1, intervalMs = 60000, cycles = 0,
    banner, fetchCycle, recordId, embedId = false, cycleTag, unit = 'anúncios' } = opts;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, `${sourceName}-state.json`);
  const sink = opts.sink ?? new Sink(outDir, sourceName);

  const state = new Map<string, WatchRow<T>>(existsSync(statePath)
    ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8')))
    : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ ${banner} | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;
    const seen: SeenItem<T>[] = [];

    const rows = await fetchCycle({ http, nowIso, pages, stopped: () => stop });
    for (const r of rows) {
      const id = recordId(r);
      if (!id) continue;
      vistos++;
      seen.push({ record: r, id });
      const prev = state.get(id);
      if (!prev) {
        const row = buildRow(r, id, nowIso, nowIso, embedId);
        state.set(id, row); await sink.upsert(row, 'new'); novos++;
      } else if (prev.price !== r.price) {
        const row = buildRow(r, id, prev.first_seen, nowIso, embedId);
        state.set(id, row); await sink.upsert(row, 'price_change'); alterados++;
      } else {
        prev.last_seen = nowIso;
      }
    }

    saveState();
    const tag = cycleTag ? cycleTag(seen, state) : ` · tabela ${state.size}`;
    console.log(`[ciclo ${cycle}] ${nowIso} — vistos ${vistos} · novos ${novos} · preço↑↓ ${alterados}`
      + `${tag} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  await sink.close(); // liberta a ligação à BD (se ativa) para o processo terminar
  console.log(`⏹ parado. tabela com ${state.size} ${unit} · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
