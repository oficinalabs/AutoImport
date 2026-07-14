// ooyyo/watch.ts — recolha CONTÍNUA (polling) do Ooyyo (secção BE). Mesma lógica do
// autocasion/watch.ts: poll de X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma
// "tabela" de estado (id→linha) e emite eventos para o sink (DB isolada em lib/sink.ts).
//
// ⚠️ RECÊNCIA (como o AutoTrader/autocasion): a SRP do Ooyyo NÃO tem ordenação por data (só
// price/year/mileage/deal — sem sortDate) e os ids são hashes (não sequenciais), logo não há sinal
// de "mais recente". O watch usa a ORDEM DEFAULT da SRP como proxy: percorre as `pages` primeiras
// páginas (seguindo "Next") e deteta novos/alterados por id + preço. Captura exaustiva de novos
// depende do re-crawl batch periódico (--full).
//
// Núcleo do polling (estado id→linha, novos/preço, sink, SIGINT, log) em lib/watch.ts; aqui só o
// fetch do ciclo (modelo seedUrl + "Next").

import { qselementsUrl, parseQsElements, parseListingPage, recordId } from './parse.ts';
import { runWatch } from '../lib/watch.ts';
import type { HttpClient } from '../lib/http.ts';
import type { OoyyoRecord } from './schema.ts';

const ehJson = (t: string) => t.includes('"makes"') || t.includes('"url"');
const ehSrp = (t: string) => t.includes('car-card-1') || t.includes('used-cars-for-sale');

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
  return runWatch<OoyyoRecord>({
    http, sourceName: 'ooyyo', outDir, pages, intervalMs, cycles,
    banner: `watch ooyyo.com (BE) | ${pages} pág (ordem default)`,
    recordId,
    fetchCycle: async ({ http, nowIso, pages, stopped }) => {
      const rows: OoyyoRecord[] = [];
      // A cada ciclo (re)obtemos o seedUrl pela API (o `code` é determinístico, mas é o ponto de
      // entrada canónico) e seguimos "Next" até `pages` páginas.
      const seedTxt = await http.fetchText(qselementsUrl(), { validate: ehJson });
      let url = seedTxt ? parseQsElements(seedTxt).seedUrl : null;

      for (let page = 1; page <= pages && url && !stopped(); page++) {
        const html = await http.fetchText(url, { validate: ehSrp });
        if (!html) break;
        const { listings, nextUrl } = parseListingPage(html, { collectedAt: nowIso });
        rows.push(...listings);
        url = nextUrl;
      }
      return rows;
    },
  });
}
