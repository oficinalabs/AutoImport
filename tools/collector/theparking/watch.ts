// watch.ts — recolha CONTÍNUA (polling) da página de anúncios mais recentes.
//
// PORQUÊ funciona: no theparking.eu a ordenação por defeito é por data (`cur_trie:date`),
// logo a PÁGINA 1 de qualquer query = os anúncios mais recentes. Fazendo poll da página 1
// de X em X tempo e comparando com o que já vimos, apanhamos:
//   - anúncios NOVOS (id nunca visto)          -> evento 'new'
//   - anúncios com PREÇO ALTERADO (id visto)    -> evento 'price_change'
// Tudo o resto é ignorado (só atualiza o last_seen).
//
// O "estado" (id -> última linha conhecida) é a nossa "tabela" enquanto não há DB:
// mantido em memória e persistido em theparking-state.json (permite reiniciar sem perder
// o histórico de dedupe/preços). O envio para a DB fica isolado em sink.ts.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE } from './http.ts';
import { parseListingPage, recordId } from './parse.ts';
import { Sink } from './sink.ts';
import type { HttpClient } from '../lib/http.ts';
import type { TheparkingRecord } from './schema.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Linha de estado = registo + id + marcas temporais de observação.
type WatchRow = TheparkingRecord & { id: string; first_seen: string; last_seen: string };

interface WatchConfig {
  http: HttpClient;
  countries: string[];
  make?: string | null;
  pages?: number;
  intervalMs?: number;
  cycles?: number;
  outDir: string;
}

function urlDaPagina(queryPath: string, page: number) {
  return page === 1
    ? `${BASE}/used-cars/${queryPath}.html`
    : `${BASE}/used-cars/${queryPath}/${page}.html`;
}

// Loop de polling. `config`:
//   http, countries[], make?, pages (páginas por query, default 1 = só recentes),
//   intervalMs (default 60000 = 1 min), cycles (0 = infinito), outDir.
export async function watch(config: WatchConfig) {
  const { http, countries, make = null, pages = 1, intervalMs = 60000, cycles = 0, outDir } = config;
  mkdirSync(outDir, { recursive: true });
  const statePath = join(outDir, 'theparking-state.json');
  const sink = new Sink(outDir);

  // Carrega o estado anterior (id -> linha) para continuar o dedupe/deteção de preço.
  const state = new Map<string, WatchRow>(existsSync(statePath)
    ? Object.entries(JSON.parse(readFileSync(statePath, 'utf8')))
    : []);
  const saveState = () => writeFileSync(statePath, JSON.stringify(Object.fromEntries(state)));

  const queries = countries.map((c) => (make ? `${c}/${make}` : c));

  // Paragem limpa com Ctrl+C.
  let stop = false;
  process.on('SIGINT', () => { stop = true; console.log('\n⏹  a terminar após o ciclo atual…'); });

  console.log(`▶ watch: ${queries.join(', ')} | ${pages} pág/query | intervalo ${intervalMs / 1000}s`
    + `${cycles ? ` | ${cycles} ciclos` : ' | contínuo (Ctrl+C p/ parar)'}\n`);

  let cycle = 0;
  while (!stop) {
    cycle++;
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    let vistos = 0, novos = 0, alterados = 0;

    for (const q of queries) {
      for (let page = 1; page <= pages && !stop; page++) {
        const url = urlDaPagina(q, page);
        // validate: página tem de trazer anúncios; senão é o Cloudflare a devolver 200
        // vazio (rate-limit intermitente) → o http faz retry.
        const html = await http.fetchText(url, { validate: (t) => t.includes('"@type": "Vehicle"') });
        if (!html) continue;
        const recs = parseListingPage(html, { collectedAt: nowIso });
        for (const r of recs) {
          const id = recordId(r);
          if (!id) continue;
          vistos++;
          const prev = state.get(id);
          if (!prev) {
            // Anúncio novo.
            const row = { ...r, id, first_seen: nowIso, last_seen: nowIso };
            state.set(id, row);
            await sink.upsert(row, 'new');
            novos++;
          } else if (prev.price !== r.price) {
            // Preço mudou → upsert de atualização (mantém o first_seen original).
            const row = { ...r, id, first_seen: prev.first_seen, last_seen: nowIso };
            state.set(id, row);
            await sink.upsert(row, 'price_change');
            alterados++;
          } else {
            // Inalterado → só marca que ainda está vivo.
            prev.last_seen = nowIso;
          }
        }
      }
    }

    saveState();
    const dt = Math.round((Date.now() - t0) / 1000);
    console.log(`[ciclo ${cycle}] ${nowIso} — vistos ${vistos} · novos ${novos} · preço↑↓ ${alterados}`
      + ` · tabela ${state.size} (${dt}s)`);

    if (cycles && cycle >= cycles) break;
    if (stop) break;

    // Espera até ao próximo ciclo (em fatias de 1s para responder ao Ctrl+C rapidamente).
    let resta = Math.max(0, intervalMs - (Date.now() - t0));
    while (resta > 0 && !stop) { const passo = Math.min(1000, resta); await sleep(passo); resta -= passo; }
  }

  saveState();
  console.log(`⏹ parado. tabela com ${state.size} anúncios · eventos em ${sink.eventsPath}`);
  return { total: state.size };
}
