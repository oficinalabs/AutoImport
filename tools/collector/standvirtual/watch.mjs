// standvirtual/watch.mjs — recolha CONTÍNUA (polling) do standvirtual.com. Mesma lógica do
// autoboerse/watch.mjs: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.mjs).
//
// ✅ RECÊNCIA REAL: pedimos a listagem ordenada por `search[order]=created_at_first:desc`
// (opção "Mais Recentes" do site) — a página 1 são os anúncios acabados de publicar. Cada node
// traz `createdAt` (ISO-8601), por isso o sinal de recência do ciclo = max(listing_created_at).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, recordId } from './parse.mjs';
import { Sink } from '../lib/sink.mjs';

const ORDER = 'created_at_first:desc';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const temAdvertSearch = (t) => t.includes('advertSearch');

function urlRecentes(page) {
  const qs = new URLSearchParams({ 'search[order]': ORDER });
  if (page > 1) qs.set('page', String(page));
  return `${BASE}/carros?${qs}`;
}

// config: { http, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'standvirtual-state.json');
  const sink = new Sink(outDir, 'standvirtual');

  const state = new Map(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch standvirtual.com | ${pages} pág recentes | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0, maisRecente = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlRecentes(page), { validate: temAdvertSearch });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (r.listing_created_at && (!maisRecente || r.listing_created_at > maisRecente)) maisRecente = r.listing_created_at;
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
      + ` · tabela ${state.size} · + recente ${maisRecente || '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
