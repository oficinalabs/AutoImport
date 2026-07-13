// ooyyo/http.mjs — cliente HTTP do Ooyyo (secção Bélgica), wrapper fino do lib/http.mjs com o
// baseUrl e a lista robots-disallow deste site. Ver lib/http.mjs para os detalhes.
//
// PORQUÊ Ooyyo é agregador: o Ooyyo (ooyyo.com) é um motor de busca de carros usados que indexa
// anúncios de dezenas de sites de origem (dealers/marketplaces). A secção BE tem ~72 mil anúncios.
// Não confundir com ooyyo.be — esse é um blog WordPress de aluguer, sem inventário. O host correto
// é www.ooyyo.com; a Bélgica é `idCountry=23` (lido dos appParams da landing `/belgium/…`).
//
// robots.txt (www.ooyyo.com): Crawl-delay: 30 para `User-agent: *` e Disallow de `/automobili/`,
// `/outlet-service-web/`, `/counter`. As rotas que usamos — a API `/ooyyo-services/…` e as páginas
// de resultados `/belgium/…used-cars-for-sale/c=<code>/` — NÃO estão nos disallow. Honramos o
// Crawl-delay: 30 com `minDelayMs` default = 30000 (pode ser baixado via --rate, com critério).
//
// Anti-bot: Cloudflare PASSIVO no www.ooyyo.com (server: cloudflare) — 200 com UA de browser, sem
// challenge. ⚠️ O host de dados `analytics.ooyyo.com` é GATED (responde "forbidden!"); por isso
// falamos com a MESMA API mas servida em `www.ooyyo.com`, que aceita HTTP puro com os headers do
// lib (Accept html + Accept-Language). Sem X-Requested-With/Referer necessários.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.ooyyo.com';

// Bélgica: idCountry=23 (dos appParams da landing BE). idLanguage=47 (Inglês) → os termos de
// combustível/carroçaria vêm normalizados em inglês ("Diesel", "Suv", "Hatchback"), coerentes com
// os outros coletores. idCurrency=3 (EUR). idDomain=1. isNew=0 (usados).
export const BE_PARAMS = {
  idDomain: '1', idCountry: '23', idLanguage: '47', idCurrency: '3', isNew: '0',
};

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Nunca lhes tocamos.
const ROBOTS_DISALLOW = ['/automobili/', '/outlet-service-web/', '/counter'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    // acceptLanguage nl-BE/fr-BE (educado, coerente com a secção BE). O conteúdo em si vem em
    // inglês por via do idLanguage=47 nos params da API (ver acima). minDelayMs default = 30000
    // para honrar o Crawl-delay: 30 do robots.txt.
    super({
      baseUrl: BASE,
      robotsDisallow: ROBOTS_DISALLOW,
      acceptLanguage: 'nl-BE,nl;q=0.9,fr-BE;q=0.8,fr;q=0.7,en;q=0.6',
      minDelayMs: 30000,
      ...opts,
    });
  }
}
