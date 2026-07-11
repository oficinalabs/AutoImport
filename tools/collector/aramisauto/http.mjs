// aramisauto/http.mjs — cliente HTTP do aramisauto.com (wrapper fino do lib/http.mjs com o
// baseUrl e a lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt do aramisauto.com: `Crawl-delay: 5` e uma lista longa de disallow. A maioria é por
// QUERY-STRING (ex. `*sort=*`, `*?years*`, `*?fuels[0]=*`, `/*orderBy`, `*utm`, `*?filtre=*`) e
// alguns por PATH (`/cdn-cgi/`, `/agence/`, `/voiture-neuve/`, `/offre/`, `/minisite/`, `/cms/`,
// `/commande/`, `/financement/`, `/beta-modele/`, `/clients/…`, `/contact/prise-rdv`, …). A rota
// que usamos — a LISTAGEM `/achat/` (e os silos SEO `/achat/{categoria}/`, `/achat/{combustível}/`)
// paginada só com `?page=N` — é PERMITIDA e não usa nenhum dos parâmetros proibidos. Nunca tocamos
// os disallow. O guard do lib (`assertAllowed`) é por prefixo de PATH; os disallow por query não são
// path-based, mas os nossos URLs também não os usam (só `?page=N`).
//
// Crawl-delay 5s: honramos com `minDelayMs` default 5000 (afinável via --rate). É o mais educado.
//
// Anti-bot: Cloudflare PASSIVO (cdn-cgi/image nas fotos, cf tokens de analytics no HTML). 200 com
// UA de browser, sem challenge em todas as probes → HTTP puro + rate-limit/retry do lib chegam.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.aramisauto.com';

// Prefixos de PATH proibidos pelo robots.txt (o guard do lib usa `startsWith`). Os disallow por
// query-string do robots não são representáveis aqui, mas os nossos URLs só usam `?page=N`.
const ROBOTS_DISALLOW = [
  '/cdn-cgi/', '/alertes/', '/c/vente/', '/cms/', '/commande/', '/devis/', '/financement/',
  '/lp/', '/slideshow/', '/vendue/', '/voitures/financing/', '/agence/', '/voiture-neuve/',
  '/offre/', '/minisite/', '/beta-modele/', '/recommandation', '/clients/', '/contact/prise-rdv',
];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    // Crawl-delay do robots = 5s → minDelayMs default 5000 (o --rate pode afinar, com cautela).
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8', minDelayMs: 5000, ...opts });
  }
}
