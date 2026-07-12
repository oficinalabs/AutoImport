// custojusto/http.mjs — cliente HTTP do CustoJusto.pt (wrapper do lib/http.mjs com o baseUrl
// e a lista robots-disallow deste site). Ver lib/http.mjs.
//
// robots.txt do CustoJusto: bloqueia paths de conta/sistema (/user/, /login, /signup, /servicos/,
// /payments, /cdn-cgi/, /v2/, /modal/, /support/ e vários prefixos curtos internos: /ar/ /cp/ /ma/
// /sp/ /vf/ /thumbs/ /pg/ /aw/ /st/ /redir/ /iredir/ /newvi/). A listagem que usamos
// (/{regiao}/veiculos/carros-usados[/...facetas]) é PERMITIDA — nunca tocamos esses paths.
//
// ⚠️ PAGINAÇÃO PROIBIDA: o robots tem `Disallow: /*?o=*` e `Disallow: /*&o=*` — o parâmetro de
// paginação `?o=N` (visto em `metadata.next`) está vedado. Por isso NUNCA construímos URLs com `?o=`
// (honramos por design, como o Flexicar honrou a API robots-proibida). A cobertura faz-se por
// FACETAS path-based (marca/distrito/categoria), cada uma a devolver a 1ª página (40 anúncios,
// ordenados por data). O `robotsDisallow` do lib é por prefixo de path (não casa query-strings), por
// isso a garantia do `?o=` é estrutural: o código simplesmente não gera esses URLs.
//
// Anti-bot: Cloudflare PASSIVO (server: cloudflare, cf-cache DYNAMIC; 200 com UA de browser, sem
// challenge em todas as probes). HTTP puro funciona; o rate-limit + retry do lib mitigam o risco.
//
// HOST CANÓNICO: www.custojusto.pt (com `www`).

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.custojusto.pt';

// Prefixos de path proibidos pelo robots.txt (só os path-based; os `?o=`/`?si=` são query e
// tratados por construção — ver cabeçalho).
const ROBOTS_DISALLOW = [
  '/ar/', '/cp/', '/ma/', '/sp/', '/support/', '/vf/', '/thumbs/', '/pg/', '/payments',
  '/cdn-cgi/', '/newvi/', '/aw/', '/st/', '/redir/', '/iredir/', '/user/', '/login', '/signup',
  '/modal/', '/servicos/', '/v2/', '/404',
];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }
}
