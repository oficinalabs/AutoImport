// autouncle/watch.mjs — recolha CONTÍNUA (polling) do autouncle.pt. Mesma lógica do
// aramisauto/autotrader: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela"
// de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.mjs).
//
// ⚠️ RECÊNCIA (proxy, honesto): o autouncle.pt NÃO permite ordenar por data — o robots proíbe os SRP
// com `s[order_by]=` (e qualquer `s[...]=`). Não há, pois, um "mais recentes primeiro" acessível. O
// watch faz poll das primeiras páginas na ordem default (relevância/preço) e deteta novos/preço por
// carId — a captura exaustiva de novos anúncios depende do re-crawl batch periódico. Como SINAL de
// deriva logamos o `days_on_market` (laytime) MÍNIMO visto por ciclo (menos dias = anúncio mais fresco).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, listingUrl, recordId } from './parse.mjs';
import { Sink } from '../lib/sink.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), brand?, outDir }
export async function watch(config) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, brand = null, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'autouncle-state.json');
  const sink = new Sink(outDir, 'autouncle');

  const state = new Map(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch autouncle.pt${brand ? ` [${brand}]` : ''} | ${pages} pág×25 (ordem default) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0, minDias = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(listingUrl({ brand, page }), { validate: (t) => t.includes('"@type":"ItemList"') });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso, forcedMake: brand });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (r.days_on_market != null && (minDias === null || r.days_on_market < minDias)) minDias = r.days_on_market;
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
      + ` · tabela ${state.size} · minDias ${minDias ?? '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
