// quoka/http.ts — cliente HTTP do quoka.de (wrapper fino do lib/http.ts com o baseUrl e a
// lista robots-disallow deste site). Ver lib/http.ts para os detalhes.
//
// robots.txt do quoka.de: `User-agent: *` → `Allow: /` com uma lista de Disallow. A rota que
// usamos (a listagem `/anzeigen/auto-motorrad/automarkt/...`) é PERMITIDA. Bloqueamos abaixo os
// prefixos proibidos (esquemas de URL antigos de pesquisa/detalhe + endpoints internos), nunca
// tocados por este coletor. O robots dá `Crawl-delay: 1` só a msnbot/bingbot — para `*` não há
// Crawl-delay, por isso honramos o default do lib (1500 ms + jitter), bem acima de 1 s.
//
// Anti-bot: Cloudflare PASSIVO (server: cloudflare; cookie de sessão `SearchAiBrowserBucket`).
// 200 com UA de browser, sem challenge em todas as probes → HTTP puro + rate-limit/retry do lib.
//
// HOST CANÓNICO: www.quoka.de (o apex redireciona para www).

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.quoka.de';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Esquemas antigos de pesquisa/detalhe
// (/Suchergebnis/, /Detailansicht/, /Bildansicht/), registo e endpoints internos.
const ROBOTS_DISALLOW = [
  '/Suchergebnis', '/Detailansicht', '/Bildansicht', '/Qinterest', '/Suchtipps_Keywordtest',
  '/registration', '/outgoing/', '/ajax/', '/xml/', '/libs/', '/tools/', '/qs/', '/qpi/',
  '/sqs/', '/message-',
];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8', ...opts });
  }
}
