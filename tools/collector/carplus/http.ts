// carplus/http.ts — cliente HTTP do carplus.pt (wrapper fino do lib/http.ts com o baseUrl e a
// lista robots-disallow deste site). Ver lib/http.ts para os detalhes.
//
// robots.txt do carplus.pt (13/07/2026): extremamente tolerante. Uma única regra
// `Disallow: /backoffice/` (área de gestão) para `User-agent: *`; tudo o resto é permitido.
// Declara o `Sitemap`. A LISTAGEM que usamos (`/carros-usados/` e `/carros-usados/{marca}/`)
// é permitida — nunca tocamos no `/backoffice/`. Sem `Crawl-delay` declarado → usamos o
// rate-limit default do lib.
//
// Anti-bot: NENHUM. 200 com UA de browser em todas as probes (home, listagem, paginação, fatias
// por marca), sem challenge. O site é um SPA Nuxt 3 com SSR completo (o HTML já traz o payload
// `__NUXT_DATA__` com todas as viaturas) → HTTP puro basta, com o rate-limit + retry/backoff do lib.
//
// NOTA sobre a API interna: o Nuxt hidrata a partir de `https://api.gsci.pt/ds/` (Grupo Salvador
// Caetano) e de um CMS `niw.pt`. NÃO a usamos — a SSR já entrega o payload completo por página, o
// que é mais robusto (não depende de contrato de API não-documentado) e mantém-nos no host público
// carplus.pt, cujo robots já validámos. País PT → Accept-Language pt-PT.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.carplus.pt';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Nenhum coincide com a listagem.
const ROBOTS_DISALLOW = ['/backoffice/'];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }
}
