// encontracarros/watch.mjs — recolha CONTÍNUA (polling) do encontracarros.pt. Deteta anúncios NOVOS e
// MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha) e emite eventos para o sink (a DB fica
// isolada em lib/sink.mjs).
//
// ⭐ RECÊNCIA REAL (ao contrário do autopt/autocasion): o `sitemap.xml` traz `<lastmod>` por anúncio.
// Cada ciclo: obtemos o sitemap, ordenado por lastmod DESC, e buscamos as páginas de detalhe cujo
// `lastmod` é MAIS RECENTE que a marca-de-água (watermark) do último ciclo — ou seja, exatamente os
// anúncios criados/atualizados desde a última vez. No 1º ciclo (sem watermark) buscamos só uma janela
// dos N mais recentes (`--pages` × PAGE_SIZE), para não descarregar 50k de uma vez.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDetail, recordId } from './parse.mjs';
import { fetchSitemap } from './sitemap.mjs';
import { PAGE_SIZE } from './crawl.mjs';
import { Sink } from '../lib/sink.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const detalheValido = (t) => t.includes('"@type":"Vehicle"') || t.includes('"carListing"');

// config: { http, pages (janela do 1º ciclo, default 1), intervalMs (default 60000), cycles (0=∞), outDir }
export async function watch(config) {
  const { http, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'encontracarros-state.json');
  const sink = new Sink(outDir, 'encontracarros');

  // Estado persistido: { rows: {id→linha}, watermark: <lastmod ISO máximo já processado> }.
  const persisted = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const state = new Map(Object.entries(persisted.rows || {}));
  let watermark = persisted.watermark || null;
  const saveState = () => writeFileSync(statePath, JSON.stringify({ rows: Object.fromEntries(state), watermark }));

  const janela = pages * PAGE_SIZE;

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch encontracarros.pt | recência via sitemap lastmod | janela inicial ${janela}`
    + ` | intervalo ${intervalMs / 1000}s${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();

    const entries = await fetchSitemap(http);          // já ordenado por lastmod DESC
    // Alvos: os mais recentes que a watermark; no 1º ciclo (sem watermark) só a janela dos N recentes.
    let alvos = watermark ? entries.filter((e) => e.lastmod && e.lastmod > watermark) : entries.slice(0, janela);
    let maxLastmod = watermark;
    let vistos = 0, novos = 0, alterados = 0;

    for (const e of alvos) {
      if (stop) break;
      const html = await http.fetchText(e.url, { validate: detalheValido });
      if (e.lastmod && (!maxLastmod || e.lastmod > maxLastmod)) maxLastmod = e.lastmod;
      if (!html) continue;
      const r = parseDetail(html, { collectedAt: nowIso, sitemap: e });
      if (!r) continue;
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
    watermark = maxLastmod || watermark;
    saveState();
    console.log(`[ciclo ${cycle}] ${nowIso} — alvos ${alvos.length} · vistos ${vistos} · novos ${novos}`
      + ` · preço↑↓ ${alterados} · tabela ${state.size} · watermark ${watermark} (${Math.round((Date.now() - t0) / 1000)}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
