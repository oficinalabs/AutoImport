// autoboerse/http.mjs — cliente HTTP do autoboerse.de (wrapper do lib/http.mjs com o baseUrl
// e a lista robots-disallow deste site). Ver lib/http.mjs.
//
// robots.txt do autoboerse: tolerante (Allow: /); bloqueia só /fahrzeugvergleich,
// /gespeicherte-suchen, /merkzettel, /lieblingsautos. Usamos o SSR da listagem
// (/fahrzeugsuche), nunca esses paths.
//
// Anti-bot: Imperva/Incapsula PASSIVO (cookies visid_incap/incap_ses; 200 sem challenge com
// UA de browser). HTTP puro funciona; o rate-limit + retry do lib mitigam o risco de escalar.
//
// HOST CANÓNICO: autoboerse.de SEM `www` (www dá 308 → redirect). Usamos o host canónico
// diretamente para evitar o salto.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://autoboerse.de';
const ROBOTS_DISALLOW = ['/fahrzeugvergleich', '/gespeicherte-suchen', '/merkzettel', '/lieblingsautos'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8', ...opts });
  }
}
