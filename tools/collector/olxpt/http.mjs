// olxpt/http.mjs — cliente HTTP do olx.pt (OLX Portugal, grupo OLX/Adevinta).
//
// PORQUÊ SÓ GET (nada de API): o olx.pt é uma React SPA, mas o servidor embute o estado COMPLETO da
// listagem no HTML, num literal `window.__PRERENDERED_STATE__ = "…"` (JSON escapado). Um GET de
// browser à página humana `/carros-motos-e-barcos/carros/` traz 52 anúncios/página com todos os
// atributos — sem browser real e sem tocar na API. Ver research/olxpt-investigacao.md.
//
// ⚠️ A API (`/api/v1/offers…`) é robots-PROIBIDA (`Disallow: /api/`). É a fonte "óbvia" (JSON
// paginável por offset), mas NÃO lhe tocamos — ficamos no SSR, que é permitido. Incluímos `/api/`
// (e restantes disallows) em ROBOTS_DISALLOW para o guard `assertAllowed` rejeitar qualquer URL de
// API por engano. Este é o oposto do autohero (onde a API estava permitida).
//
// Anti-bot: PASSIVO — 200 com UA de browser + Accept-Language pt-PT em todas as probes (listagem,
// paginação `?page=N`, facetas de marca/distrito, sort). Sem challenge ativo. Sem proxies/stealth.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.olx.pt';

// Path da secção de carros usados (category_id 378). O `--full` acrescenta-lhe a faceta de marca.
export const CAT_PATH = '/carros-motos-e-barcos/carros/';

// Mercado fixo: Portugal, EUR, pt-PT.
export const MARKET = {
  countryLabel: 'PORTUGAL',
  currency: 'EUR',
  acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8',
};

// Prefixos de PATH proibidos pelo robots.txt de www.olx.pt (guard por `startsWith`). O CRÍTICO é
// `/api/` — garante que nunca disparamos a API JSON (robots-proibida) mesmo que a refatorássemos por
// engano. Os wildcards mid-path do robots (`*/ajax/`, `*/i2/*`, …) não são exprimíveis por startsWith,
// mas as nossas URLs (só `/carros-motos-e-barcos/carros/…`) nunca lhes tocam.
const ROBOTS_DISALLOW = [
  '/api/', '/adminpanel/', '/adprint/', '/anuncio/leaflet/', '/anuncio/contact/',
  '/payment/', '/searchform/', '/anunciar/confirm/', '/anunciar/confirmpage/',
  '/i2/anuncio/abuse/', '/m/anuncio/abuse/', '/i2/anuncio/contact/',
];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: MARKET.acceptLanguage, ...opts });
  }

  // fetchListing: GET à página de listagem SSR, validando que o estado veio embutido. Devolve o HTML
  // (ou null se esgotar as tentativas / vier sem estado — trata-se como retryável).
  async fetchListing(url) {
    return this.fetchText(url, { validate: (t) => t.includes('window.__PRERENDERED_STATE__') });
  }
}
