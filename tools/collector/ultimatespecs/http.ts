// http.ts — cliente HTTP do ultimatespecs.com (fino wrapper do lib/http.ts).
//
// O robots.txt do site permite as páginas de specs mas impõe `Crawl-delay: 30` —
// o default de 30 s/pedido AQUI é essa regra, não uma escolha nossa. Não baixar.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.ultimatespecs.com';

// Paths proibidos pelo robots.txt do ultimatespecs.com.
const ROBOTS_DISALLOW = ['/includes/', '/lang/', '/car-comparator/sitemap'];

// Crawl-delay do robots.txt (segundos → ms).
export const CRAWL_DELAY_MS = 30_000;

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    // Clamp: --rate pode subir o delay, nunca descer abaixo do Crawl-delay do robots.
    const minDelayMs = Math.max(opts.minDelayMs ?? CRAWL_DELAY_MS, CRAWL_DELAY_MS);
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, ...opts, minDelayMs });
  }
}
