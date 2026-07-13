// autocasion/http.ts — cliente HTTP do autocasion.com (wrapper fino do lib/http.ts com o
// baseUrl e a lista robots-disallow deste site). Ver lib/http.ts para os detalhes.
//
// robots.txt do autocasion.com: tolerante. Bloqueia /api/, /movil*, /pixel, /rate*, /rated*,
// /ads/galeria/*, /cdn-cgi/, /index2.php e prefixos de filtros por query. A LISTAGEM que usamos
// (/coches-ocasion e /coches-segunda-mano/{marca}-ocasion) é permitida — nunca tocamos os
// disallow. Os disallow por query não são path-based, mas os nossos URLs também não os usam.
//
// Anti-bot: Cloudflare PASSIVO (server: cloudflare, cf-cache DYNAMIC; backend PHP/PHPSESSID).
// 200 com UA de browser, sem challenge em todas as probes → HTTP puro + rate-limit/retry do lib.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.autocasion.com';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). `/rate` cobre /rate* e /rated*.
const ROBOTS_DISALLOW = ['/api/', '/movil', '/pixel', '/rate', '/ads/galeria/', '/cdn-cgi/', '/index2.php'];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8', ...opts });
  }
}
