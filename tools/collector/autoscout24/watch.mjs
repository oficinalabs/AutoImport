// autoscout24/watch.mjs — recolha CONTÍNUA (polling) do AutoScout24. Mesma lógica do
// autotrader/watch.mjs: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.mjs).
//
// ✅ RECÊNCIA REAL: ao contrário do autotrader.nl, o AutoScout24 EXPÕE ordenação por data de
// publicação — `sort=age&desc=1` ("Neueste Angebote zuerst" = mais recentes primeiro) e ainda
// um filtro `onlineSince` (1–14 dias). Usamo-la: o watch apanha inventário GENUINAMENTE novo
// (não só um proxy). Confirmado ao vivo — ver research/autoscout24-investigacao.md.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseListingPage, recordId } from './parse.mjs';
import { Sink } from '../lib/sink.mjs';

const BASE = 'https://www.autoscout24.de';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const validate = (t) => t.includes('__NEXT_DATA__');

// URL de recentes: sort=age&desc=1 (publicação mais recente primeiro), opcionalmente por
// país (cy) e marca (slug ou mmvmk0).
function urlRecentes({ cy, slug, makeId, size, page, onlineSince }) {
  const path = slug ? `/lst/${slug}` : '/lst';
  const qs = new URLSearchParams({ sort: 'age', desc: '1', size: String(size) });
  if (cy) qs.set('cy', cy);
  if (makeId && !slug) qs.set('mmvmk0', String(makeId));
  if (onlineSince) qs.set('onlineSince', String(onlineSince));
  if (page && page > 1) qs.set('page', String(page));
  return `${BASE}${path}?${qs}`;
}

// config: { http, countries[] (default [null]), make {slug,id}|null, pages, size, intervalMs,
//           cycles (0=infinito), onlineSince|null, outDir }
export async function watch(config) {
  const {
    http, countries = [null], make = null, pages = 1, size = 20,
    intervalMs = 60000, cycles = 0, onlineSince = null, outDir,
  } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'autoscout24-state.json');
  const sink = new Sink(outDir, 'autoscout24');

  const state = new Map(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  const cyList = countries.length ? countries : [null];
  console.log(`▶ watch AutoScout24 | ${cyList.map((c) => c || 'ALL').join(',')}`
    + `${make ? ` | ${make.slug || make.id}` : ''} | ${pages} pág recentes (sort=age) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;

    for (const cy of cyList) {
      for (let page = 1; page <= pages && !stop; page++) {
        const url = urlRecentes({ cy, slug: make?.slug || null, makeId: make?.id || null, size, page, onlineSince });
        const html = await http.fetchText(url, { validate });
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
