// autohero/http.mjs — cliente HTTP do autohero.com (retalhista de usados do grupo AUTO1).
//
// PORQUÊ POST (e não só o GET fetchText do lib): o autohero.com é uma app SPA (Apollo/GraphQL).
// A página de listagem `/de/search/` embute o estado no `window.__APOLLO_STATE__` (SSR), mas SÓ
// traz os primeiros ~24-30 resultados e a paginação real (scroll infinito) é feita por XHR a uma
// API GraphQL. Felizmente essa API está NO MESMO HOST (`window.__config.API_URL` = www.autohero.com)
// e o endpoint — `POST /v1/retail-customer-gateway/graphql` — devolve JSON puro, pagina por
// `limit`/`offset` e NÃO exige autenticação. É a fonte mais rica e a ÚNICA que permite cobertura
// completa. Ver research/autohero-investigacao.md.
//
// robots.txt (www.autohero.com) — verificado: só proíbe `/*/myhero/*`, `/*/inspection/`,
// `/*/checkout/*`, `/*/identify`, `/*/center`, `/*/unsubscribe/*`. O host da API é o MESMO e o path
// `/v1/retail-customer-gateway/graphql` NÃO cai em nenhum disallow → é PERMITIDO. (Contraste com o
// Flexicar, onde a API estava noutro host com `Disallow: /` e por isso não a usámos.) Sem
// Crawl-delay declarado → mantemos o default educado do lib (1500ms + jitter).
//
// Anti-bot: CloudFront PASSIVO (200 com UA de browser em todas as probes, sem challenge JS/DataDome).
// HTTP puro + rate-limit/retry do lib chegam.
//
// Este wrapper acrescenta ao BaseClient (que só faz GET) um `postGraphql()` que REUTILIZA o
// rate-limit (`_throttle`), a guarda de robots (`assertAllowed`) e o cookie jar da base.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.autohero.com';

// MERCADO: escolhemos a Alemanha (/de/, de-DE, EUR) — o catálogo mais rico e o mercado-mãe do
// AUTO1. Para trocar de mercado basta mudar este objeto (o robots e a API são multi-país).
export const MARKET = {
  country: 'DE',           // filtro countryCode da API
  countryLabel: 'GERMANY', // rótulo no registo normalizado (uniforme com o autoboerse)
  locale: 'de-DE',
  pathPrefix: '/de',       // prefixo SEO das rotas humanas (detail_url)
  currency: 'EUR',
  acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
};

// Endpoint da API GraphQL (mesmo host; path permitido pelo robots — ver cabeçalho).
export const GRAPHQL_PATH = '/v1/retail-customer-gateway/graphql';

// Prefixos de PATH proibidos pelo robots.txt, instanciados para o nosso locale (o guard do lib usa
// `startsWith`; os `/*/` do robots são por-locale). Nunca tocamos nenhum destes.
const ROBOTS_DISALLOW = [
  `${MARKET.pathPrefix}/myhero/`, `${MARKET.pathPrefix}/inspection/`,
  `${MARKET.pathPrefix}/checkout/`, `${MARKET.pathPrefix}/identify`,
  `${MARKET.pathPrefix}/center`, `${MARKET.pathPrefix}/unsubscribe/`,
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: MARKET.acceptLanguage, ...opts });
  }

  // postGraphql: POST à API GraphQL com throttle + retry/backoff, reutilizando a infra da base.
  // `variables` é o objeto `{ search: {...} }` (ver parse.mjs). Devolve o JSON.data.searchAdV9AdsV2
  // (o objeto `{ total, data[] }`) ou null se esgotar as tentativas / a resposta for inútil.
  async postGraphql(variables) {
    const url = BASE + GRAPHQL_PATH;
    this.assertAllowed(url);                     // guarda robots (mesma lógica do GET)
    const body = JSON.stringify({
      operationName: 'searchAdV9AdsV2',
      // Query mínima: o resolver devolve um ESCALAR JSON (sem sub-seleção de campos), por isso não
      // temos de enumerar campos — vem tudo. Assinatura extraída do bundle da app.
      query: 'query searchAdV9AdsV2($search: EsSearchRequestProjectionInput!, $tradeInId: UUID) '
        + '{ searchAdV9AdsV2(search: $search, tradeInId: $tradeInId) }',
      variables,
    });
    let lastErr = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._throttle();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Language': this.acceptLanguage,
            ...(this.cookies.size ? { Cookie: this._cookieHeader() } : {}),
          },
          body,
          redirect: 'follow',
        });
        this._storeCookies(res);
        if (!res.ok) { lastErr = `HTTP ${res.status}`; }
        else {
          const json = await res.json().catch(() => null);
          const ads = json?.data?.searchAdV9AdsV2;
          if (ads && Array.isArray(ads.data)) return ads;
          lastErr = json?.errors?.[0]?.message || 'resposta sem dados';
        }
      } catch (e) { lastErr = e.message; }
      if (attempt < this.maxRetries) await sleep(1000 * 2 ** attempt); // backoff 1s,2s,4s…
    }
    console.warn(`  ⚠ falhou POST graphql (offset ${variables?.search?.offset}) após ${this.maxRetries + 1} tentativas: ${lastErr}`);
    return null;
  }
}
