// http.ts — cliente HTTP do theparking.eu (fino wrapper do cliente genérico lib/http.ts
// com o baseUrl e a lista robots-disallow deste site). Ver lib/http.ts para os detalhes.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.theparking.eu';

// Paths proibidos pelo robots.txt do theparking.eu.
const ROBOTS_DISALLOW = ['/tools/', '/extlink/', '/tag/'];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, ...opts });
  }
}
