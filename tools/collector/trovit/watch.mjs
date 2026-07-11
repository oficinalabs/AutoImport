// trovit/watch.mjs — recolha CONTÍNUA (polling) do coches.trovit.es. Mesma lógica do
// autoboerse/watch.mjs: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.mjs).
//
// ✅ RECÊNCIA REAL: o Trovit tem sort por data — `?order_by=source_date` ("Fecha (más recientes)").
// A página 1 ordenada por data traz os anúncios mais frescos primeiro (nas probes, o topo dizia
// "Hace 4 h") → deteção de novos fiável. Cada card traz ainda "Hace 21 h 21 minutos"
// (updated_ago_min) → logamos o MÍNIMO por ciclo como sinal de frescura.
//
// Nota (agregador sem página "todos"): o Trovit não tem feed único de todos os coches; o watch
// vigia UM slug (default: `madrid`, a maior cidade → feed denso e diverso). Para vigiar o país
// inteiro, correr vários watchers com --slug distintos (marca/cidade).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.mjs';
import { parseListingPage, recordId, DEFAULT_SLUG } from './parse.mjs';
import { Sink } from '../lib/sink.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const temCards = (t) => t.includes('item-cars-snippet');

// URL de recentes: slug + paginação no path + `?order_by=source_date` (mais recentes primeiro).
function urlRecentes(slug, page) {
  return `${BASE}/coches/${slug}${page > 1 ? `/${page}` : ''}?order_by=source_date`;
}

// config: { http, slug, pages (default 1), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config) {
  const { http, slug = DEFAULT_SLUG, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'trovit-state.json');
  const sink = new Sink(outDir, 'trovit');

  const state = new Map(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch coches.trovit.es | slug "${slug}" | ${pages} pág (sort por data) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0, maisFresco = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlRecentes(slug, page), { validate: temCards });
      if (!html) continue;
      const { listings } = parseListingPage(html, { collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        if (r.updated_ago_min != null) maisFresco = maisFresco === null ? r.updated_ago_min : Math.min(maisFresco, r.updated_ago_min);
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
      + ` · tabela ${state.size} · mais fresco ${maisFresco != null ? `${maisFresco} min` : '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
