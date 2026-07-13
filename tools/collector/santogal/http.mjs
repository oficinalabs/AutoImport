// santogal/http.mjs — cliente HTTP do santogal.pt (wrapper fino do lib/http.mjs com o baseUrl e a
// lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt do santogal.pt (13/07/2026): TOTALMENTE permissivo — `User-agent: *` com
// `Disallow:` VAZIO (nada proibido) e só declara o `Sitemap:`. Não há Crawl-delay → usamos o
// rate-limit default do lib. A listagem que usamos (/pt/search-page/) é permitida; a lista de
// disallow fica vazia por simetria com os outros coletores (nada a bloquear).
//
// Anti-bot: Cloudflare PASSIVO (server: cloudflare; a raiz faz 307 → /pt/). 200 com UA de browser
// em todas as probes, sem challenge → HTTP puro basta, com o rate-limit + retry/backoff do lib.
// País PT → Accept-Language pt-PT.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.santogal.pt';

// robots.txt não proíbe nenhum path (Disallow vazio). Mantemos a lista vazia — a guarda
// `assertAllowed` do lib continua a validar a origem, mas nada é bloqueado.
const ROBOTS_DISALLOW = [];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }
}
