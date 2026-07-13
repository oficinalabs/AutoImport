// ooyyo/watch.ts — recolha CONTÍNUA (polling) do Ooyyo (secção BE). Mesma lógica do
// autocasion/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): a SRP do Ooyyo NÃO tem ordenação por data (só
// price/year/mileage/deal — sem sortDate) e os ids são hashes (não sequenciais), logo não há sinal
// de "mais recente". O watch usa a ORDEM DEFAULT da SRP como proxy: percorre as `pages` primeiras
// páginas (seguindo "Next") e deteta novos/alterados por id + preço. Captura exaustiva de novos
// depende do re-crawl batch periódico (--full).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { qselementsUrl, parseQsElements, parseListingPage, recordId } from './parse.ts';
import { Sink } from '../lib/sink.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OoyyoRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ehJson = (t: string) => t.includes('"makes"') || t.includes('"url"');
const ehSrp = (t: string) => t.includes('car-card-1') || t.includes('used-cars-for-sale');

// Linha de estado = registo + marcas temporais de observação.
type WatchRow = OoyyoRecord & { first_seen: string; last_seen: string };

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
  const statePath = join(outDir, 'ooyyo-state.json');
  const sink = new Sink(outDir, 'ooyyo');

  const state = new Map<string, WatchRow>(existsSync(statePath) ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8'))) : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch ooyyo.com (BE) | ${pages} pág (ordem default) | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;

    // A cada ciclo (re)obtemos o seedUrl pela API (o `code` é determinístico, mas é o ponto de
    // entrada canónico) e seguimos "Next" até `pages` páginas.
    const seedTxt = await http.fetchText(qselementsUrl(), { validate: ehJson });
    let url = seedTxt ? parseQsElements(seedTxt).seedUrl : null;

    for (let page = 1; page <= pages && url && !stop; page++) {
      const html = await http.fetchText(url, { validate: ehSrp });
      if (!html) break;
      const { listings, nextUrl } = parseListingPage(html, { collectedAt: nowIso });
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
      url = nextUrl;
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
