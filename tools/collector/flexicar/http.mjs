// flexicar/http.mjs — cliente HTTP do flexicar.es (wrapper fino do lib/http.mjs com o baseUrl e a
// lista robots-disallow deste site). Ver lib/http.mjs para os detalhes.
//
// robots.txt de www.flexicar.es: tolerante. Bloqueia /admin/, /api/, /iniciar-sesion/, /search/ e o
// padrão de query /*?utm. As rotas que usamos (/coches-segunda-mano/, /{marca}/segunda-mano/,
// /{marca}/{modelo}/coches-{provincia}/segunda-mano/, /sitemap.xml) são PERMITIDAS — nunca tocamos os
// disallow. O padrão /*?utm não é path-based (é query) e os nossos URLs não usam ?utm.
//
// ⛔ CRÍTICO: a API que pagina o stock vive em `services.flexicar.es`, cujo robots.txt é `Disallow: /`
// (TUDO proibido). NÃO a usamos — este cliente só fala com www.flexicar.es. A cobertura obtém-se
// fatiando facetas do SSR (12 veículos por URL), nunca via a API de paginação.
//
// Anti-bot: NENHUM (server: nginx, x-nextjs-cache HIT). 200 com UA de browser em todas as probes →
// HTTP puro + rate-limit/retry do lib.

import { HttpClient as BaseClient } from '../lib/http.mjs';

export const BASE = 'https://www.flexicar.es';

// Prefixos de path proibidos pelo robots.txt de www.flexicar.es (`startsWith`).
const ROBOTS_DISALLOW = ['/admin/', '/api/', '/iniciar-sesion/', '/search/'];

export class HttpClient extends BaseClient {
  constructor(opts = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8', ...opts });
  }
}
