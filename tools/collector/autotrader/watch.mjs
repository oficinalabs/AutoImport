// autotrader/watch.mjs — recolha CONTÍNUA (polling) do AutoTrader.nl. Mesma lógica do
// theparking/watch.mjs: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.mjs).
//
// ⚠️ RECÊNCIA: o AutoTrader (Scout24) NÃO expõe ordenação por data de publicação (só por
// preço/ano/km/potência/1ª-registo). Usamos `sort=age&desc=1` (1ª-registo mais recente) como
// PROXY de recência — apanha inventário fresco e mudanças de preço no segmento mais recente.
// A captura exaustiva de novos anúncios depende do re-crawl batch periódico.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, recordId } from './parse.mjs';
import { Sink } from '../lib/sink.mjs';

const BASE = 'https://www.autotrader.nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function urlRecentes(page) {
  const qs = new URLSearchParams({ atype: 'C', sort: 'age', desc: '1' });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/auto/occasions?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'autotrader-state.json');
  const sink = new Sink(outDir, 'autotrader');

  const state = new Map(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch AutoTrader.nl | ${pages} pág recentes | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlRecentes(page), { validate: (t) => t.includes('__NEXT_DATA__') });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
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
      + ` · tabela ${state.size} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
