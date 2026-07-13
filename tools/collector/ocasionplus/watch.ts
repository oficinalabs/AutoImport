// ocasionplus/watch.ts — recolha CONTÍNUA (polling) do ocasionplus.com. Mesma lógica do
// autocasion/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela"
// de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): o "Ordenar" do OcasionPlus é por query `?sort=`, que o
// robots.txt PROÍBE — logo não o usamos. A listagem default vem por `itemListOrder: Relevance` e o
// id é um token alfanumérico (NÃO crescente por data), pelo que não há sinal numérico de recência.
// O watch usa a ORDEM DEFAULT da página 1 como proxy e loga o `id` do topo por ciclo (marcador de
// deriva). Captura exaustiva de novos depende do re-crawl batch periódico.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OcasionplusRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const temVehicle = (t: string) => t.includes('"@type":"Vehicle"');

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = OcasionplusRecord & { first_seen: string; last_seen: string };

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlRecentes(page: number) {
  return `${BASE}/coches-segunda-mano${page > 1 ? `?page=${page}` : ''}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'ocasionplus-state.json');
  const sink = new Sink(outDir, 'ocasionplus');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch ocasionplus.com | ${pages} pág (ordem default) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;
    let topo: string | null = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlRecentes(page), { validate: temVehicle });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (topo === null) topo = id;                      // id do topo da página 1 = marcador de deriva
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
      + ` · tabela ${state.size} · topo ${topo ?? '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
