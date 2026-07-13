// autotrader/http.ts — cliente HTTP do AutoTrader.nl (wrapper do lib/http.ts com o baseUrl
// e a lista robots-disallow deste site). Ver lib/http.ts.
//
// robots.txt do AutoTrader: tolerante (Allow: /); bloqueia /api/, /private-feedback/ e
// páginas de conta/comparação. Usamos o SSR (páginas de listagem), nunca /api/.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.autotrader.nl';
const ROBOTS_DISALLOW = ['/api/', '/private-feedback/', '/transformCookie'];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'nl-NL,nl;q=0.9,en;q=0.8', ...opts });
  }
}
