// custojusto/watch.ts — recolha CONTÍNUA (polling) do CustoJusto.pt. Mesma lógica do
// autoboerse/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela"
// de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL: o CustoJusto ordena por omissão por data de publicação (SORT_DESC_PUBLISH_DATE)
// e cada anúncio traz `listTime` (ISO). A 1ª página da listagem base são os anúncios mais recentes →
// deteção de novos fiável.
//
// ⚠️ SEM PAGINAÇÃO: `?o=N` está robots-proibido, por isso NÃO paginamos — cada ciclo lê a 1ª página
// da listagem base (40 anúncios mais recentes). Para não perder novos entre ciclos, o intervalo deve
// ser ≤ tempo típico de 40 novas publicações. A captura exaustiva depende do re-crawl batch (--full).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from './http.ts';
import type { CustojustoRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const URL_RECENTES = `${BASE}/portugal/veiculos/carros-usados`;   // default sort = data desc

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = CustojustoRecord & { first_seen: string; last_seen: string };

interface WatchConfig {
  http: HttpClient;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

// config: { http, intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'custojusto-state.json');
  const sink = new Sink(outDir, 'custojusto');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch custojusto.pt | listagem base (data desc) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;
    let maxTime: string | null = null;

    const html = await http.fetchText(URL_RECENTES, { validate: (t) => t.includes('__NEXT_DATA__') });
    if (html) {
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (r.listing_created_at && (!maxTime || r.listing_created_at > maxTime)) maxTime = r.listing_created_at;
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
      + ` · último ${maxTime || '?'} · tabela ${state.size} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
