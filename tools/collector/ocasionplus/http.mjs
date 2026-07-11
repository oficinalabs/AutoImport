// ocasionplus/http.mjs — cliente HTTP do ocasionplus.com (wrapper fino do lib/http.mjs com o
// baseUrl e a lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt do ocasionplus.com: os disallow são quase todos por QUERY-STRING (`*?marca=*`,
// `*?modelo=*`, `*?combustible=*`, `*?sort=*`, `*?location=*`, `*?type=*`, `*?price_min=*`…) ou
// por SUFIXO de ação (`/coches-segunda-mano/*/mas-info`, `.../pedir-cita`, `.../quiero-reservarlo`,
// `*/print/`, `*/search`). A nossa recolha NUNCA usa filtros por query — fatiamos por PATH
// (`/coches-segunda-mano/{marca}`) e paginamos só com `?page=N` (que NÃO está proibido). O único
// disallow expresso como prefixo de path é `/vender-mi-coche/cambio/` — guardado abaixo. Os
// padrões por query/sufixo não são representáveis por `startsWith`, mas honramo-los por construção.
//
// Anti-bot: Next.js (App Router / RSC) atrás de CloudFront. 200 com UA de browser, sem challenge
// em todas as probes → HTTP puro + rate-limit/retry do lib. `acceptLanguage` es-ES (site ES).

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.ocasionplus.com';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Ver nota acima: os restantes disallow
// são por query/sufixo e são respeitados por construção (só emitimos paths de listagem + `?page`).
const ROBOTS_DISALLOW = ['/vender-mi-coche/cambio/'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8', ...opts });
  }
}
