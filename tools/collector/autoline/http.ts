// autoline/http.ts — cliente HTTP do autoline.pt (wrapper fino do lib/http.ts com o baseUrl
// e a lista robots-disallow deste site). Ver lib/http.ts para os detalhes.
//
// SITE: autoline.pt — instância portuguesa (interface pt-PT) do marketplace pan-europeu do grupo
// Via Mobilis / LineMedia. Recolhemos a secção PAÍS = Bélgica (cnt BE) da categoria CARROS
// (passenger cars, `--c1169`). ⚠️ É um marketplace sobretudo de VEÍCULOS COMERCIAIS/PESADOS e
// máquinas — mas TEM categoria de ligeiros (`/carros`), que é a que recolhemos. Ver
// research/autoline-investigacao.md.
//
// Anti-bot: NENHUM ativo. `curl`/fetch com UA de browser → 200 em todas as probes (sem challenge
// Cloudflare/Incapsula/DataDome). HTTP puro + rate-limit/retry do lib chegam.
//
// robots.txt (guardado aqui + em lib/http): tolerante para a listagem. Bloqueia sobretudo paths
// de app/UI e endpoints (`/api/`, `/search/`, `/sales/`, `/export/`, `/big-photos/`, `/-/sdb/`…).
// A LISTAGEM que usamos — `/-/carros/{Pais}--c1169cnt{CC}` — é PERMITIDA (nunca lhe tocamos os
// disallow). ⚠️ REGRA-CHAVE: o robots tem `Disallow: /-/*sort=` (wildcard no meio do path) — por
// isso NUNCA emitimos URLs com `?sort=` (a ordenação por data está fora; ver watch.ts). Sem
// Crawl-delay para `*` (só para bots nomeados) → o default do lib (1,5 s) é educado.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://autoline.pt';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Só os que poderiam colidir com a
// nossa navegação; os padrões com wildcard no meio (ex. `/-/*sort=`) não são exprimíveis por
// prefixo — garantimos a conformidade NÃO os gerando (nunca usamos `?sort=`).
const ROBOTS_DISALLOW = [
  '/api/', '/search/', '/search.php', '/sales/', '/sales-history/', '/export/',
  '/big-photos/', '/print-pdf/', '/compare/', '/order/', '/login/', '/registration',
  '/change-locale/', '/dealers/', '/components/', '/-/sdb/', '/my/', '/stock.php',
];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }
}
