// trovit/http.mjs — cliente HTTP do Trovit (wrapper fino do lib/http.mjs com o baseUrl e a
// lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// ALVO: coches.trovit.es (secção de automóveis de Espanha do agregador Trovit / Lifull Connect).
// Escolhido nas probes por ser o mais rico e limpo: HTTP puro devolve 200 sem qualquer challenge,
// com JSON-LD `SearchResultsPage` (array de 25 `Car`) + cards SSR. A estrutura fica pronta a
// estender a outros países (voiture.trovit.fr, auto.trovit.it, …) — todos partilham o mesmo
// motor/robots; basta trocar BASE + o segmento da rota (`coches`→`voiture`/`auto`/…) e a língua.
//
// robots.txt do Trovit (idêntico em todos os países): bloqueia `/redirect/`, `/scripts/redirect.php/`,
// `/index.php/` (com poucas exceções `cod.get_*`), `/rd/`, `/rss/`, `/listing/`, `/details/`,
// `/project/`, `/publisher/`, `/afc/`, `/notifications`. A LISTAGEM que usamos (`/coches/{slug}`)
// é PERMITIDA — nunca tocamos os disallow. NOTA IMPORTANTE (agregador): o link de cada anúncio
// aponta para um redirecionador de clique (`rd.clk.thribee.com`, domínio externo cujo robots é
// `Disallow: /`) que esconde o site de origem → NÃO resolvemos esse redirect (respeitamos o robots
// do thribee). Consequência: `source` (site de origem) fica null; ver schema.mjs.
//
// Anti-bot: nenhum (sem Cloudflare/DataDome/Incapsula; 200 direto com UA de browser em todas as
// probes). Sem `Crawl-delay` no robots → usamos o rate-limit/backoff default do lib. Cookies de
// sessão (uqTrovit/cTrovit) são guardados pelo lib/http.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://coches.trovit.es';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Os nossos URLs (`/coches/{slug}`)
// nunca caem aqui; a guarda em lib/http.assertAllowed recusa qualquer pedido que caísse.
const ROBOTS_DISALLOW = [
  '/redirect/', '/scripts/redirect.php/', '/index.php/', '/rd/', '/rss/',
  '/listing/', '/details/', '/project/', '/publisher/', '/afc/', '/notifications',
];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8', ...opts });
  }
}
