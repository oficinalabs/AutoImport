// autouncle/http.ts — cliente HTTP do AutoUncle (meta-motor/agregador dinamarquês), MULTI-PAÍS.
//
// O AutoUncle tem 14 domínios nacionais (autouncle.pt/.de/.dk/…), todos a MESMA SPA Next.js
// (chunks em assets-fe.autouncle.com) com o MESMO molde SSR: JSON-LD `ItemList` + payload RSC
// (ver parse.ts). Só variam o domínio, o locale, o slug do SRP, a moeda e o rótulo de país —
// tudo capturado na tabela `MARKETS` abaixo (paths confirmados no robots.txt de cada domínio).
//
// PORQUÊ SSR (e não uma API "escondida"): a página de listagem é renderizada no servidor e
// embute TUDO o que precisamos em dois sítios: (1) um bloco `application/ld+json` (`@graph` →
// `ItemList` com 25 carros ricos + `numberOfItems` = total) e (2) o payload RSC (React Server
// Components) em ~250 `self.__next_f.push([...])`, que traz por carro a FONTE de origem
// (`sourceName`), o rating de preço (AutoScore, `auRating`), a imagem real, a variante e os dias
// em stock. Juntamos os dois pelo id numérico do carro (molde theparking).
// Ver research/autouncle-investigacao.md.
//
// robots.txt (molde igual nos 14 domínios; verificado no .pt): cada domínio só permite o SEU
// locale (os outros estão em Disallow) e bloqueia os SRP com parâmetros de pesquisa (estilo Rails):
//     Disallow: /{locale}/{srp}/*s[order_by]=*
//     Disallow: /{locale}/{srp}/*s[*]=*
// → NÃO podemos usar filtros/ordenação por query `s[...]=`. A cobertura faz-se SÓ por **facetas
// de PATH** (`{srp}/{Marca}`, canónico) + `?page=N` (que não contém `s[` → é permitido). Nunca
// pedimos a saída para o site de origem (`outgoingPath`, ex. `/pt/link-externo/…` — slug
// localizado por país) — apenas LEMOS o slug no HTML. A API de config
// `/api/v4/car_search_form/config` (lista de marcas para o --full) não está em Disallow.
//
// Anti-bot: varia por domínio. PASSIVO (200 com UA de browser, HTTP puro chega) em 10 domínios:
// pt, dk, se, at, pl, fi, ro, ch, nl, fr. ATIVO (Cloudflare managed challenge, 403 "Just a
// moment…") em 4: de, it, es, uk — HTTP puro não passa; ficam na tabela para o dia em que abram
// (o crawl falha gracioso e salta o mercado). Sondado a 2026-07-15.
//
// Este wrapper acrescenta ao BaseClient (só GET de texto) um `fetchJson()` que REUTILIZA o
// rate-limit (`_throttle`), a guarda de robots (`assertAllowed`) e o cookie jar da base — usado
// para a config API. `forMarket()` clona o cliente para outro domínio (o crawl multi-mercado usa
// um cliente por domínio, preservando os knobs de rate/retry).

import { HttpClient as BaseClient, type HttpClientOptions } from '../lib/http.ts';

// Um mercado nacional do AutoUncle. `tld` = sufixo do domínio (autouncle.{tld}); o resto são os
// knobs localizados: rótulo de país (uniforme entre coletores), locale (1º segmento dos paths),
// SRP (path de listagem SSR, do robots.txt), moeda dos anúncios e Accept-Language coerente.
export interface Market {
  code: string;          // chave curta do CLI (--market pt,dk,…)
  tld: string;           // autouncle.{tld} — 'pt', 'co.uk', …
  countryLabel: string;  // rótulo no registo normalizado (uniforme com os outros coletores)
  locale: string;        // locale permitido no domínio ('pt', 'de-at', 'en-gb', …)
  listPath: string;      // SRP humano (SSR) — a rota de listagem
  currency: string;      // fallback quando o JSON-LD não traz priceCurrency
  acceptLanguage: string;
}

// Os 14 mercados (paths lidos do robots.txt de cada domínio a 2026-07-15). Totais na sonda:
// nl 544k · fr 251k · ch 185k · at 151k · se 133k · ro 116k · pl 108k · pt 99k · fi 38k · dk 30k
// (de/it/es/uk atrás de Cloudflare ativo — inacessíveis a HTTP puro, ver nota acima).
export const MARKETS: Record<string, Market> = {
  pt: { code: 'pt', tld: 'pt',    countryLabel: 'PORTUGAL',       locale: 'pt',    listPath: '/pt/carros-usados',         currency: 'EUR', acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8' },
  de: { code: 'de', tld: 'de',    countryLabel: 'GERMANY',        locale: 'de',    listPath: '/de/gebrauchtwagen',        currency: 'EUR', acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8' },
  dk: { code: 'dk', tld: 'dk',    countryLabel: 'DENMARK',        locale: 'da',    listPath: '/da/brugte-biler',          currency: 'DKK', acceptLanguage: 'da-DK,da;q=0.9,en;q=0.8' },
  se: { code: 'se', tld: 'se',    countryLabel: 'SWEDEN',         locale: 'se',    listPath: '/se/begagnade-bilar',       currency: 'SEK', acceptLanguage: 'sv-SE,sv;q=0.9,en;q=0.8' },
  it: { code: 'it', tld: 'it',    countryLabel: 'ITALY',          locale: 'it',    listPath: '/it/auto-usate',            currency: 'EUR', acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8' },
  at: { code: 'at', tld: 'at',    countryLabel: 'AUSTRIA',        locale: 'de-at', listPath: '/de-at/gebrauchtwagen',     currency: 'EUR', acceptLanguage: 'de-AT,de;q=0.9,en;q=0.8' },
  es: { code: 'es', tld: 'es',    countryLabel: 'SPAIN',          locale: 'es',    listPath: '/es/coches-segunda-mano',   currency: 'EUR', acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8' },
  pl: { code: 'pl', tld: 'pl',    countryLabel: 'POLAND',         locale: 'pl',    listPath: '/pl/samochody-uzywane',     currency: 'PLN', acceptLanguage: 'pl-PL,pl;q=0.9,en;q=0.8' },
  fi: { code: 'fi', tld: 'fi',    countryLabel: 'FINLAND',        locale: 'fi',    listPath: '/fi/kaytetyt-autot',        currency: 'EUR', acceptLanguage: 'fi-FI,fi;q=0.9,en;q=0.8' },
  ro: { code: 'ro', tld: 'ro',    countryLabel: 'ROMANIA',        locale: 'ro',    listPath: '/ro/masini-second-hand',    currency: 'EUR', acceptLanguage: 'ro-RO,ro;q=0.9,en;q=0.8' },
  ch: { code: 'ch', tld: 'ch',    countryLabel: 'SWITZERLAND',    locale: 'de-ch', listPath: '/de-ch/gebrauchtwagen',     currency: 'CHF', acceptLanguage: 'de-CH,de;q=0.9,en;q=0.8' },
  uk: { code: 'uk', tld: 'co.uk', countryLabel: 'UNITED KINGDOM', locale: 'en-gb', listPath: '/en-gb/used-cars',          currency: 'GBP', acceptLanguage: 'en-GB,en;q=0.9' },
  nl: { code: 'nl', tld: 'nl',    countryLabel: 'NETHERLANDS',    locale: 'nl-nl', listPath: '/nl-nl/gebruikte-auto',     currency: 'EUR', acceptLanguage: 'nl-NL,nl;q=0.9,en;q=0.8' },
  fr: { code: 'fr', tld: 'fr',    countryLabel: 'FRANCE',         locale: 'fr',    listPath: '/fr/voitures-occasion',     currency: 'EUR', acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8' },
};

export function marketBase(m: Market): string { return `https://www.autouncle.${m.tld}`; }
export function marketSourceSite(m: Market): string { return `autouncle.${m.tld}`; }

// Resolve um código de mercado do CLI ('pt', 'uk', …) → Market, com erro claro.
export function resolveMarket(code: string): Market {
  const m = MARKETS[code.trim().toLowerCase()];
  if (!m) throw new Error(`mercado desconhecido: "${code}" (válidos: ${Object.keys(MARKETS).join(', ')})`);
  return m;
}

// Endpoint da API de config (lista de marcas com contagens, p/ semear o --full). Igual nos 14 domínios.
export const CONFIG_PATH = '/api/v4/car_search_form/config';

// Todos os locales da família (do robots do .pt: cada domínio só permite o seu; 'en' e 'nl-be'
// aparecem no robots mas não têm domínio próprio nesta tabela).
const ALL_LOCALES = ['pt', 'de', 'de-at', 'de-ch', 'es', 'fr', 'it', 'en', 'en-gb', 'da', 'se', 'ro', 'pl', 'fi', 'nl-nl', 'nl-be'];

// Prefixos de PATH que o nosso código NUNCA deve pedir (o guard do lib usa `startsWith`):
// as raízes dos OUTROS locales (em Disallow em cada domínio) + entradas globais. Os disallow de
// query `s[...]=` e a saída p/ origem (slug localizado por país) garantem-se por construção —
// só pedimos {listPath}[/{Marca}][?page=N] e a config API.
function robotsDisallowFor(market: Market): string[] {
  return [
    ...ALL_LOCALES.filter((l) => l !== market.locale).map((l) => `/${l}/`),
    '/widgets/', '/api/facebook-proxy',
  ];
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpClient extends BaseClient {
  market: Market;

  constructor(opts: HttpClientOptions & { market?: Market } = {}) {
    const { market = MARKETS.pt, ...rest } = opts;
    super({
      baseUrl: marketBase(market),
      robotsDisallow: robotsDisallowFor(market),
      acceptLanguage: market.acceptLanguage,
      ...rest,
    });
    this.market = market;
  }

  // Clona o cliente para outro mercado (domínio/locale/robots próprios), preservando os knobs.
  forMarket(market: Market): HttpClient {
    if (market.code === this.market.code) return this;
    return new HttpClient({
      market,
      minDelayMs: this.minDelayMs, jitterMs: this.jitterMs, maxRetries: this.maxRetries,
    });
  }

  // fetchJson: GET à API de config (JSON) com throttle + retry/backoff, reutilizando a infra da base.
  // Devolve o objeto JSON ou null se esgotar as tentativas.
  async fetchJson(url: string): Promise<unknown> {
    this.assertAllowed(url);                     // guarda robots (mesma lógica do GET de texto)
    let lastErr: string | null = null;
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
      } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
      if (attempt < this.maxRetries) await sleep(1000 * 2 ** attempt); // backoff 1s,2s,4s…
    }
    console.warn(`  ⚠ falhou GET json ${url} após ${this.maxRetries + 1} tentativas: ${lastErr}`);
    return null;
  }
}
