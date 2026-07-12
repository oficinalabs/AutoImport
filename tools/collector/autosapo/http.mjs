// autosapo/http.mjs — cliente HTTP do auto.sapo.pt (marketplace nacional do portal SAPO).
//
// PORQUÊ só GET (herda o `fetchText` do lib, sem POST à la autohero): ao contrário do que a pista
// sugeria (SPA JS-heavy com API JSON), o auto.sapo.pt é uma app **ASP.NET Core MVC com SSR** — o
// HTML da listagem `/carros-usados` já traz os 20 cartões de anúncio renderizados no servidor
// (a camada Vue.min.js só hidrata favoritos/filtros no cliente). Não há API JSON pública de
// pesquisa: os dados vêm do HTML SSR. Logo o GET de browser do lib basta. Ver
// research/autosapo-investigacao.md.
//
// auto-frontoffice.sapo.pt (o backoffice de anunciantes) só aparece em links "Anunciar grátis" /
// "Comerciantes" — NÃO serve o inventário; é o portal de quem PÕE anúncios, não de quem os lê. Por
// isso não o tocamos.
//
// robots.txt (auto.sapo.pt) — verificado: `Disallow: /account/` e `/user/` APENAS. As nossas rotas
// (`/carros-usados`, `/carro-usado/…`, `/carros/{marca}.html`, `/sitemap/…`) NÃO caem em nenhum
// disallow → PERMITIDAS. Sem `Crawl-delay` declarado → mantemos o default educado do lib. O robots
// lista dezenas de sitemaps (marcas, distritos, combustíveis…) que usamos como taxonomia.
//
// Anti-bot: NENHUM challenge (200 com UA de browser em todas as probes; servidor ASP.NET, cookie
// `assid` de sessão guardado pelo cookie jar do lib). ⚠️ MAS há rate-limiting por rajada: 5 pedidos
// consecutivos sem pausa devolveram páginas vazias (0 cartões); com o delay+jitter do lib (1500ms)
// nunca falhou. Confirma a necessidade do throttle — HTTP puro chega, sem proxies/stealth.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://auto.sapo.pt';

// MERCADO: Portugal (fixo — o auto.sapo.pt é 100% nacional). Rótulos uniformes com os outros coletores.
export const PAIS = 'PORTUGAL';
export const MOEDA = 'EUR';
const ACCEPT_LANGUAGE = 'pt-PT,pt;q=0.9,en;q=0.8';

// Prefixos de PATH proibidos pelo robots.txt (o guard do lib usa `startsWith`). Nunca lá tocamos.
const ROBOTS_DISALLOW = ['/account/', '/user/'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: ACCEPT_LANGUAGE, ...opts });
  }
}
