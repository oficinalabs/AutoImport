// autosapo/watch.ts — recolha CONTÍNUA (polling) do auto.sapo.pt. Mesma lógica dos outros
// coletores: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado
// (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ✅ RECÊNCIA: o `orderby=1` ("Mais recente") é HONRADO pelo SSR — as viaturas NÃO promovidas vêm
// por data de publicação DESCENDENTE. A 1ª página é toda "Em destaque" (promovidos, que flutuam ao
// topo), mas a partir da pág. 2-3 surgem os anúncios genuinamente recentes. Por isso o watch pede as
// PRIMEIRAS PÁGINAS por `orderby=1` (default 3) e apanha os novos aí. Sinal de deriva = o
// `published_at` mais recente do ciclo — descodificado do ObjectId (o timestamp está embutido nele),
// pelo que temos data REAL de publicação por anúncio, sem depender de nenhum campo do cartão.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import {
  LISTING_PATH, BRANDS_SITEMAP, ORDER_RECENTE, parseListingPage, recordId, temCartoes, extractBrandSlugs,
} from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from './http.ts';
import type { AutosapoRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = AutosapoRecord & { first_seen: string; last_seen: string };

interface WatchConfig {
  http: HttpClient;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlListagem(page: number) {
  return `${BASE}${LISTING_PATH}?p=${page}&orderby=${ORDER_RECENTE}`;
}

// config: { http, pages (default 3), intervalMs (default 60000), cycles (0=infinito), outDir }
export async function watch(config: WatchConfig) {
  const { http, pages = 3, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'autosapo-state.json');
  const sink = new Sink(outDir, 'autosapo');

  // Taxonomia de marcas (1 pedido) para separar marca/modelo.
  const brandXml = await http.fetchText(BASE + BRANDS_SITEMAP);
  const brandSet = extractBrandSlugs(brandXml || '');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch auto.sapo.pt | ${pages} pág×20 (orderby=recente) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;
    let maisRecente: string | null = null;

    for (let page = 1; page <= pages && !stop; page++) {
      const html = await http.fetchText(urlListagem(page), { validate: temCartoes });
      if (!html) continue;
      const { listings } = parseListingPage(html, { brandSet, collectedAt: nowIso });
      for (const r of listings) {
        const id = recordId(r);
        if (!id) continue;
        vistos++;
        const pub = r.published_at;
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
