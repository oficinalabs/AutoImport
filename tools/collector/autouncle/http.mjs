// autouncle/http.mjs — cliente HTTP do autouncle.pt (meta-motor/agregador dinamarquês, versão PT).
//
// PORQUÊ SSR (e não uma API "escondida"): o autouncle.pt é uma SPA Next.js (App Router; chunks em
// assets-fe.autouncle.com). MAS a página de listagem `/pt/carros-usados` é renderizada no servidor e
// embute TUDO o que precisamos em dois sítios: (1) um bloco `application/ld+json` (`@graph` →
// `ItemList` com 25 carros ricos + `numberOfItems` = total) e (2) o payload RSC (React Server
// Components) em ~250 `self.__next_f.push([...])`, que traz por carro a FONTE de origem (`sourceName`),
// o rating de preço (AutoScore, `auRating`), a imagem real, a variante e os dias em stock. Juntamos os
// dois pelo id numérico do carro (molde theparking). Ver research/autouncle-investigacao.md.
//
// robots.txt (www.autouncle.pt) — verificado. Neste domínio PT, o locale **`/pt/` é PERMITIDO**
// (todos os outros — `/de/`, `/es/`, `/fr/`, … — estão em `Disallow`). MAS há um bloqueio-chave dos
// SRP com parâmetros de pesquisa (estilo Rails):
//     Disallow: /pt/carros-usados/*s[order_by]=*
//     Disallow: /pt/carros-usados/*s[*]=*
// → NÃO podemos usar filtros/ordenação por query `s[...]=`. Por isso a cobertura faz-se SÓ por
// **facetas de PATH** (`/pt/carros-usados/{Marca}`, canónico) + `?page=N` (que não contém `s[` → é
// permitido). Nunca pedimos `/pt/link-externo/…` (a saída para o site de origem, também em Disallow) —
// apenas LEMOS o slug da fonte no HTML. A API de config `/api/v4/car_search_form/config` (lista de
// marcas para o --full) NÃO está em Disallow → é permitida.
//
// Anti-bot: PASSIVO (Cloudflare) — 200 com UA de browser em todas as probes, sem challenge. HTTP puro
// + rate-limit/retry do lib chegam. Sem proxies nem stealth.
//
// Este wrapper acrescenta ao BaseClient (só GET de texto) um `fetchJson()` que REUTILIZA o rate-limit
// (`_throttle`), a guarda de robots (`assertAllowed`) e o cookie jar da base — usado para a config API.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.autouncle.pt';

// MERCADO: Portugal (/pt/, pt-PT, EUR). É a versão PT do meta-motor; o domínio .pt só permite `/pt/`.
export const MARKET = {
  countryLabel: 'PORTUGAL',            // rótulo uniforme no registo normalizado
  locale: 'pt',
  pathPrefix: '/pt',
  listPath: '/pt/carros-usados',       // SRP humano (SSR) — a rota de listagem
  currency: 'EUR',
  acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8',
};

// Endpoint da API de config (lista de marcas com contagens, p/ semear o --full). Permitido pelo robots.
export const CONFIG_PATH = '/api/v4/car_search_form/config';

// Prefixos de PATH proibidos pelo robots.txt que o nosso código NUNCA deve pedir (o guard do lib usa
// `startsWith`). Incluímos os relevantes ao locale /pt/ (saída p/ origem, apps de valuation, widgets,
// proxy) + as raízes dos OUTROS locales (todos em Disallow neste domínio). Os disallow de query
// `s[...]=` não se exprimem por prefixo de path — garantimos por construção (só usamos path + ?page).
const ROBOTS_DISALLOW = [
  '/pt/link-externo/', '/pt/apps/', '/pt/my-autouncle', '/pt/o-meu-autouncle',
  '/widgets/', '/api/facebook-proxy',
  '/de/', '/de-at/', '/de-ch/', '/es/', '/fr/', '/it/', '/en/', '/en-gb/',
  '/da/', '/se/', '/ro/', '/pl/', '/fi/', '/nl-nl/', '/nl-be/',
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: MARKET.acceptLanguage, ...opts });
  }

  // fetchJson: GET à API de config (JSON) com throttle + retry/backoff, reutilizando a infra da base.
  // Devolve o objeto JSON ou null se esgotar as tentativas.
  async fetchJson(url) {
    this.assertAllowed(url);                     // guarda robots (mesma lógica do GET de texto)
    let lastErr = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._throttle();
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Accept-Language': this.acceptLanguage,
            ...(this.cookies.size ? { Cookie: this._cookieHeader() } : {}),
          },
          redirect: 'follow',
        });
        this._storeCookies(res);
        if (!res.ok) { lastErr = `HTTP ${res.status}`; }
        else {
          const json = await res.json().catch(() => null);
          if (json) return json;
          lastErr = 'resposta sem JSON';
        }
      } catch (e) { lastErr = e.message; }
      if (attempt < this.maxRetries) await sleep(1000 * 2 ** attempt); // backoff 1s,2s,4s…
    }
    console.warn(`  ⚠ falhou GET json ${url} após ${this.maxRetries + 1} tentativas: ${lastErr}`);
    return null;
  }
}
