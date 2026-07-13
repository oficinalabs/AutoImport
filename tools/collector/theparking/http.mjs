// http.mjs — cliente HTTP do theparking.eu (fino wrapper do cliente genérico lib/http.mjs
// com o baseUrl e a lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.theparking.eu';

// Paths proibidos pelo robots.txt do theparking.eu.
const ROBOTS_DISALLOW = ['/tools/', '/extlink/', '/tag/'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, ...opts });
  }
}
