// autoscout24/http.ts — cliente HTTP do AutoScout24 (wrapper do lib/http.ts com o baseUrl
// e a lista robots-disallow deste site). Ver lib/http.ts.
//
// ⚠️ ROBOTS COM TRANSPARÊNCIA: ao contrário dos outros 23 coletores, o robots.txt do AutoScout24
// é RESTRITIVO (ver research/autoscout24-investigacao.md, secção "Robots"):
//   • bloqueia UAs de bots-IA (ClaudeBot/GPTBot/CCBot/Google-Extended) com `Disallow: /`;
//   • no bloco `User-agent: *` proíbe a pesquisa parametrizada base `/lst?` e `/lst/?`,
//     as páginas de detalhe `/angebote/`, e qualquer URL com `cat=`.
// DECISÃO EXPLÍCITA DO UTILIZADOR: recolher com params livres (`/lst/<marca>?...`) e UA de
// browser (não de bot). Documentamos isto abertamente. A stack HTTP puro passa (HTTP/2 200,
// sem DataDome/Cloudflare-challenge), pelo que Scrapling NÃO é necessário — fica como
// contingência caso comecem a desafiar sob volume.
//
// A guarda `robotsDisallow` abaixo continua a proteger os paths de CONTA/SISTEMA e a API
// interna (`/api/…`, GraphQL de pesquisa) — nesses NUNCA tocamos, por serem privados e
// desnecessários (o SSR `__NEXT_DATA__` traz tudo).

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.autoscout24.de';

// Paths de conta/sistema/API que respeitamos SEMPRE (subconjunto do `User-agent: *` do robots
// que não colide com a recolha de listagens/detalhe que o utilizador optou por fazer).
const ROBOTS_DISALLOW = [
  '/api/', '/dealerarea/', '/entry/', '/favorites', '/account', '/cockpit/',
  '/private-feedback/', '/partner/', '/Partner/', '/partner-experience/', '/i/',
  '/dealer-detail/', '/dealer-statistics', '/dealer-rating/', '/detailsuche',
  '/auto-catalog/', '/listing-form/', '/listing-creation-entry-point',
  '/listing-search-api/', '/ocs/api/', '/as24-search-funnel/api/',
  '/search-subscriptions/api/', '/frontend-metrics',
];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8', ...opts });
  }
}
