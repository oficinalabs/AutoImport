// http.ts — cliente HTTP do ultimatespecs.com (fino wrapper do lib/http.ts).
//
// O robots.txt do site permite as páginas de specs mas impõe `Crawl-delay: 30` —
// esse é o DEFAULT aqui, com clamp (--rate só sobe). O modo --fast do CLI cria
// clientes com `ignoreCrawlDelay` — exceção deliberada e documentada no README
// (recolha completa em horas em vez de ~20 dias); quem o liga assume o risco de
// bloqueio. Mesmo em fast há sempre throttle por worker — nunca fogo-à-vontade.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.ultimatespecs.com';

// Paths proibidos pelo robots.txt do ultimatespecs.com.
const ROBOTS_DISALLOW = ['/includes/', '/lang/', '/car-comparator/sitemap'];

// Crawl-delay do robots.txt (segundos → ms).
export const CRAWL_DELAY_MS = 30_000;

// Piso do throttle por worker em --fast: abaixo disto seria martelar o site.
export const FAST_FLOOR_MS = 500;

export interface UsHttpOptions extends HttpClientOptions {
  ignoreCrawlDelay?: boolean;
}

export class HttpClient extends BaseClient {
  constructor({ ignoreCrawlDelay = false, ...opts }: UsHttpOptions = {}) {
    const minDelayMs = ignoreCrawlDelay
      ? Math.max(opts.minDelayMs ?? 1000, FAST_FLOOR_MS)
      : Math.max(opts.minDelayMs ?? CRAWL_DELAY_MS, CRAWL_DELAY_MS);
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, ...opts, minDelayMs });
  }
}
