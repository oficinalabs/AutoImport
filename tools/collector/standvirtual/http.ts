// standvirtual/http.ts — cliente HTTP do standvirtual.com (wrapper do lib/http.ts com o
// baseUrl, a lista robots-disallow e o Accept-Language pt-PT deste site). Ver lib/http.ts.
//
// StandVirtual = o maior marketplace de usados de Portugal (grupo OLX/Adevinta; irmão do
// OTOMOTO polaco). Stack Next.js + GraphQL (urql). Recolhemos o SSR da LISTAGEM (/carros),
// nunca a API GraphQL — ver a nota de robots abaixo.
//
// robots.txt (www.standvirtual.com) — verificado. Para `User-agent: *`: `Allow: /` no fim,
// mas com vários prefixos proibidos, entre eles **`Disallow: /api/`** e **`Disallow: /ajax/`**.
// ⚠️ POR ISSO NÃO usamos o endpoint GraphQL (fica sob `/api/`, que o robots proíbe) — usamos
// APENAS o HTML SSR da listagem `/carros`, que embute os anúncios no urqlState (ver parse.ts)
// e está no ramo `Allow: /`. Os prefixos proibidos abaixo são instanciados no guard do lib
// (`assertAllowed`, por `startsWith`); nunca lhes tocamos.
//
// Anti-bot: DataDome PASSIVO nas probes (200 com UA de browser em /carros, /carros/{marca},
// paginação e sort; a página vem completa, ~1.3 MB, com o urqlState preenchido — sem challenge
// nem captcha ativos). O SSR traz os anúncios via HTTP puro. Rate-limit + retry do lib mitigam
// o risco de escalar; usamos um minDelay conservador (2500ms) por o site ter reputação anti-bot.
//
// HOST CANÓNICO: www.standvirtual.com (o apex redirect para www).

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

export const BASE = 'https://www.standvirtual.com';

// Prefixos de PATH proibidos pelo robots.txt (ramo User-agent: *). O guard do lib usa
// `startsWith`, por isso listamos os prefixos simples (os padrões com wildcard do robots —
// /authentication*, */rss/, /catalog/*/*/ — não são atingidos pela nossa rota /carros).
const ROBOTS_DISALLOW = [
  '/adminpanel/', '/authentication', '/catalog/', '/account/', '/myaccount/',
  '/adprint/', '/ad2/', '/ad/leaflet/', '/ad/contact/', '/payment/', '/adding/',
  '/i2/', '/ajax/', '/api/',
];

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({
      baseUrl: BASE,
      robotsDisallow: ROBOTS_DISALLOW,
      acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8',
      minDelayMs: 2500,   // conservador: o site tem reputação anti-bot (DataDome)
      ...opts,
    });
  }
}
