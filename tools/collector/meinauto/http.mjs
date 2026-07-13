// meinauto/http.mjs — cliente HTTP do meinauto.de (wrapper fino do lib/http.mjs com o baseUrl
// e a lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt do meinauto.de (User-agent: *): MUITO tolerante — só bloqueia `/envkv/`, `/motoren/`,
// `/ausstattung/` e o padrão legado `/*_escaped_fragment_`. SEM Crawl-delay para `*` (vários bots
// SEO — Ahrefs/Semrush/MJ12… — levam Disallow:/ total, mas nós somos `*`). A LISTAGEM que usamos
// (`/fahrzeugsuche/`, `/gebrauchtwagen/`) é permitida — nunca tocamos os disallow.
//
// Anti-bot: PASSIVO. Stack Google (envoy + GCLB cookie) com Baqend Speedkit à frente; 200 com UA de
// browser em todas as probes, sem challenge. HTTP puro funciona; rate-limit + retry do lib mitigam
// o risco sob volume. Mantemos o default (1500ms) por não haver Crawl-delay declarado.
//
// HOST CANÓNICO: `www.meinauto.de` COM `www` (sem `www` redireciona). A rota de resultados exige a
// barra final: `/fahrzeugsuche/` (sem ela, 301 → acrescenta `/`). Usamos sempre a forma canónica.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.meinauto.de';

// Prefixos de path proibidos pelo robots.txt (`startsWith`). Nunca lhes tocamos.
const ROBOTS_DISALLOW = ['/envkv/', '/motoren/', '/ausstattung/'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8', ...opts });
  }
}
