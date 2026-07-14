// caetano/http.ts — cliente HTTP do coletor Caetano (rede de stands do Grupo Salvador Caetano /
// Caetano Baviera Portugal; stock de usados/seminovos publicado em caetano.pt).
//
// PORQUÊ API JSON (e não o GET fetchText do lib): a página de pesquisa de usados `/pesquisa/` é uma
// SPA Vue ("Digital Store" do Grupo Salvador Caetano). O HTML SSR só traz a casca da app + a config
// em `var __CAETANO_VUE_APP__ = {...}` — SEM anúncios. Os anúncios vêm todos de uma API JSON:
//     POST https://api.gsci.pt/ds/search/v2?numberElements=N&page=P&showReservation=0&related=false&withUrl=false
// com o header `companyId: 24` (o id da Caetano na plataforma; extraído de VUE_APP_COMPANY_ID) e um
// body JSON de filtros (usamos `{}` = catálogo de usados completo). A resposta é `{ count, data:{
// searchResult[] }, pagination:{ maxPage, ... } }` — rica, paginável e sem autenticação (só o header
// companyId; SEM token/cookie). É a ÚNICA fonte que pagina o stock inteiro. Ver
// research/caetano-investigacao.md.
//
// ⚠️ companyId OBRIGATÓRIO: sem o header a API responde 400 "Invalid companyId sent." (confirmado).
// O `Origin`/`Referer` NÃO são exigidos.
//
// robots.txt — DOIS hosts, ambos permissivos:
//   • api.gsci.pt (host de DADOS): não tem robots.txt (o gateway responde 404 JSON "no Route
//     matched") → nenhum path proibido; o endpoint `/ds/search/v2` é livre.
//   • caetano.pt (host do SITE, de onde só CONSTRUÍMOS os detail_url, nunca os pedimos): robots
//     tolerante — `User-agent: *` com apenas `Disallow: /wp-admin/` (WordPress) e `Allow:
//     /wp-admin/admin-ajax.php`. A pesquisa `/pesquisa/` é permitida. Nunca tocamos em /wp-admin/.
//   Sem Crawl-delay declarado em nenhum → usamos o rate-limit default educado do lib.
//
// Anti-bot: PASSIVO. `curl`/fetch com UA de browser → 200 em todas as probes ao api.gsci.pt e ao
// caetano.pt, sem challenge (Akamai/CDN passivo). HTTP puro + rate-limit/retry do lib chegam.
//
// Este wrapper acrescenta ao BaseClient (que só faz GET de texto) um `postSearch()` que REUTILIZA o
// rate-limit (`_throttle`), a guarda de robots (`assertAllowed`) e o cookie jar da base.

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

// Host da API de dados (a base do assertAllowed é este host — é onde de facto fazemos pedidos).
export const BASE = 'https://api.gsci.pt';
// Host público do site (usado só para construir os detail_url legíveis; nunca é pedido por HTTP).
export const SITE = 'https://caetano.pt';
// Endpoint de pesquisa (POST). Ver cabeçalho para os parâmetros de query.
export const SEARCH_PATH = '/ds/search/v2';
// Id da Caetano na plataforma Digital Store (header obrigatório). Constante da config da SPA.
export const COMPANY_ID = 24;

// api.gsci.pt não declara robots (404) → nada proibido. Lista vazia (o guard do lib usa startsWith).
const ROBOTS_DISALLOW: string[] = [];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Parâmetros do postSearch (todos opcionais; cada chamador passa só o que precisa).
export interface SearchParams {
  page?: number;
  numberElements?: number;
  sort?: string | null;
  orderBy?: string | null;
  body?: Record<string, unknown>;
}

export class HttpClient extends BaseClient {
  constructor(opts: HttpClientOptions = {}) {
    super({ baseUrl: BASE, robotsDisallow: ROBOTS_DISALLOW, acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8', ...opts });
  }

  // postSearch: POST à API de pesquisa com throttle + retry/backoff, reutilizando a infra da base.
  // params: { page, numberElements, sort?, orderBy?, body? }. Devolve o objeto JSON completo
  // ({ count, data:{ searchResult[] }, pagination }) ou null se esgotar as tentativas. O payload
  // externo é dinâmico → tipado como `unknown`, com narrowing em quem consome (parse.ts).
  async postSearch({ page = 1, numberElements = 250, sort = null, orderBy = null, body = {} }: SearchParams = {}): Promise<unknown> {
    const qs = new URLSearchParams({
      numberElements: String(numberElements),
      page: String(page),
      showReservation: '0',
      related: 'false',
      withUrl: 'false',
    });
    if (sort) qs.set('sort', sort);
    if (orderBy) qs.set('orderBy', orderBy);
    const url = `${BASE}${SEARCH_PATH}?${qs.toString()}`;
    this.assertAllowed(url);                     // guarda robots (mesma lógica do GET do lib)
    const payload = JSON.stringify(body);
    let lastErr: string | null = null;
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
            companyId: String(COMPANY_ID),       // OBRIGATÓRIO (400 sem ele)
            ...(this.cookies.size ? { Cookie: this._cookieHeader() } : {}),
          },
          body: payload,
          redirect: 'follow',
        });
        this._storeCookies(res);
        if (!res.ok) { lastErr = `HTTP ${res.status}`; }
        else {
          const json = await res.json().catch(() => null) as { data?: { searchResult?: unknown }; message?: unknown } | null;
          if (json && Array.isArray(json.data?.searchResult)) return json;
          lastErr = (typeof json?.message === 'string' ? json.message : null) || 'resposta sem searchResult';
        }
      } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
      if (attempt < this.maxRetries) await sleep(1000 * 2 ** attempt); // backoff 1s,2s,4s…
    }
    console.warn(`  ⚠ falhou POST search (page ${page}) após ${this.maxRetries + 1} tentativas: ${lastErr}`);
    return null;
  }
}
