// autohero/watch.ts — recolha CONTÍNUA (polling) do autohero.com. Mesma lógica do
// aramisauto/autoboerse: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela"
// de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA REAL (vantagem sobre aramisauto/autotrader): a API tem o sort `newest_eligible`
// (determinístico, por data de publicação/elegibilidade) e cada anúncio traz `firstPublishedAt`. O
// watch pede as primeiras páginas por esse sort → os anúncios NOVOS aparecem no topo. Logamos o
// `firstPublishedAt` mais recente por ciclo como sinal de deriva.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildVariables, parseAdsResponse, recordId, LIMIT_MAX, SORT_RECENTE } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from './http.ts';
import type { AutoheroRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = AutoheroRecord & { first_seen: string; last_seen: string };

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
  const statePath = join(outDir, 'autohero-state.json');
  const sink = new Sink(outDir, 'autohero');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch autohero.com | ${pages} pág×${LIMIT_MAX} (sort recência) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;
    let maisRecente: string | null = null;

    for (let page = 0; page < pages && !stop; page++) {
      const ads = await http.postGraphql(buildVariables({ offset: page * LIMIT_MAX, limit: LIMIT_MAX, sort: SORT_RECENTE }));
      if (!ads) continue;
      const { listings } = parseAdsResponse(ads, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        const pub = r.listing_first_published_at;
        if (pub && (maisRecente === null || pub > maisRecente)) maisRecente = pub;
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
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
