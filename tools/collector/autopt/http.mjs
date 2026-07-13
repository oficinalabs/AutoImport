// autopt/http.mjs — cliente HTTP do auto.pt (wrapper fino do lib/http.mjs com o baseUrl e a
// lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt do auto.pt (12/07/2026): muito tolerante. Só proíbe /area-pessoal e três widgets
// AJAX em /_components/ (FavoriteWidget, GoogleMapsWidget[Multiple]); tudo o resto é `Allow: /`.
// A LISTAGEM que usamos (/carros-usados e /carros-usados/{marca|distrito}) é permitida — nunca
// tocamos nos disallow. Sem Crawl-delay declarado → usamos o rate-limit default do lib.
//
// Anti-bot: Cloudflare PASSIVO (server: cloudflare, cf-cache-status DYNAMIC; backend Symfony/
// Webpack Encore). 200 com UA de browser em todas as probes, sem challenge → HTTP puro basta,
// com o rate-limit + retry/backoff do lib. País PT → Accept-Language pt-PT.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.auto.pt';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Nenhum coincide com a listagem.
const ROBOTS_DISALLOW = ['/area-pessoal', '/_components/'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }
}
