// lib/http.mjs — cliente HTTP genérico, rápido e "educado", partilhado pelos coletores.
//
// PORQUÊ: os sites-alvo servem os dados no HTML (SSR) e passam com um GET de browser, sem
// browser real → rápido. Este cliente trata do que é comum: User-Agent de browser, cookie
// jar, rate-limit (delay + jitter), retry com backoff, e uma guarda que respeita o robots.txt.
// É parametrizado por `baseUrl` e pela lista de paths proibidos (`robotsDisallow`), para
// servir qualquer site.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpClient {
  // opts: { baseUrl, robotsDisallow[], minDelayMs, jitterMs, maxRetries, acceptLanguage }
  constructor({ baseUrl, robotsDisallow = [], minDelayMs = 1500, jitterMs = 700,
    maxRetries = 4, acceptLanguage = 'en-GB,en;q=0.9' } = {}) {
    this.baseUrl = baseUrl;
    this.robotsDisallow = robotsDisallow;
    this.cookies = new Map();
    this.minDelayMs = minDelayMs;
    this.jitterMs = jitterMs;
    this.maxRetries = maxRetries;
    this.acceptLanguage = acceptLanguage;
    this._lastReqAt = 0;
  }

  // Recusa qualquer URL cujo path caia na lista robots-disallow do site.
  assertAllowed(url) {
    const path = new URL(url, this.baseUrl).pathname;
    if (this.robotsDisallow.some((p) => path.startsWith(p))) {
      throw new Error(`robots.txt proíbe: ${path}`);
    }
  }

  // Guarda os cookies recebidos para os reenviar (mantém a sessão).
  _storeCookies(res) {
    const set = res.headers.getSetCookie?.() || [];
    for (const line of set) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  _cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // Rate-limit: espera o mínimo desde o último pedido + jitter aleatório.
  async _throttle() {
    const wait = this._lastReqAt + this.minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    if (this.jitterMs) await sleep(Math.floor((Date.now() % 1000) / 1000 * this.jitterMs));
    this._lastReqAt = Date.now();
  }

  // fetchText: GET com throttle + retry/backoff.
  // `validate(text)` opcional: se devolver false, trata como retryável (ex. anti-bot que
  // responde 200 mas com página vazia). Devolve o texto ou null se esgotar as tentativas.
  async fetchText(url, { validate } = {}) {
    this.assertAllowed(url);
    let lastErr = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._throttle();
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': this.acceptLanguage,
            ...(this.cookies.size ? { Cookie: this._cookieHeader() } : {}),
          },
          redirect: 'follow',
        });
        this._storeCookies(res);
        if (!res.ok) { lastErr = `HTTP ${res.status}`; }
        else {
          const text = await res.text();
          if (!validate || validate(text)) return text;
          lastErr = 'validação falhou (página vazia?)';
        }
      } catch (e) { lastErr = e.message; }
      if (attempt < this.maxRetries) await sleep(1000 * 2 ** attempt); // backoff 1s,2s,4s…
    }
    console.warn(`  ⚠ falhou ${url} após ${this.maxRetries + 1} tentativas: ${lastErr}`);
    return null;
  }
}
