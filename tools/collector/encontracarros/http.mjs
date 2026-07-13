// encontracarros/http.mjs — cliente HTTP do encontracarros.pt (wrapper fino do lib/http.mjs com o
// baseUrl e a lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt do encontracarros.pt (13/07/2026): extremamente tolerante:
//     User-Agent: *
//     Allow: /
//     Disallow: /link
//     Sitemap: https://encontracarros.pt/sitemap.xml
// Só proíbe `/link` (o redirecionador para o site de origem, ex. `/link?anuncio=…`). NUNCA lhe
// tocamos — não precisamos dele: o URL externo original já vem no HTML da página de detalhe. Tudo o
// resto (sitemap.xml, /anuncio/…, /pesquisa) é permitido. Sem Crawl-delay → rate-limit default do lib.
//
// Anti-bot: Next.js (App Router; server: Vercel-style, `data-precedence="next"`, styled-components).
// 200 com UA de browser em TODAS as probes, sem challenge → HTTP puro basta, com o rate-limit +
// retry/backoff do lib. País PT → Accept-Language pt-PT.
//
// ⚠️ NOTA de arquitetura: a listagem `/pesquisa` é renderizada no cliente (os resultados vêm por
// fetch client-side; o HTML inicial NÃO traz cards) → inútil por HTTP puro. A recolha faz-se pelo
// **sitemap.xml** (enumera ~50k anúncios recentes com `lastmod`) + **páginas de detalhe** `/anuncio/…`
// que são SSR e riquíssimas (JSON-LD `Vehicle` + objeto `carListing` no payload RSC). Ver
// research/encontracarros-investigacao.md.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.encontracarros.pt';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). `/link` é o único — e nunca o pedimos.
const ROBOTS_DISALLOW = ['/link'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }
}
