// http.mjs — cliente HTTP rápido e "educado" para o theparking.eu.
//
// PORQUÊ HTTP puro (sem browser): a investigação (research/theparking-investigacao.md)
// confirmou que um GET com User-Agent de browser passa o Cloudflare (200). Não é preciso
// Playwright para recolher → muito mais rápido e barato. Usamos o `fetch` nativo do Node.
//
// Responsabilidades: User-Agent de browser, cookie jar (PHPSESSID/PKG), rate-limit
// (delay + jitter), retry com backoff (inclui o caso do bloqueio intermitente do
// Cloudflare que devolve 200 mas página vazia), e uma guarda que respeita o robots.txt.

const BASE = 'https://www.theparking.eu';

// UA de browser real — sem isto o Cloudflare devolve 403.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Paths proibidos pelo robots.txt do theparking.eu. Nunca os pedimos.
const ROBOTS_DISALLOW = ['/tools/', '/extlink/', '/tag/'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cliente com estado (cookie jar + relógio de rate-limit). Instanciar um por corrida.
export class HttpClient {
  constructor({ minDelayMs = 1500, jitterMs = 700, maxRetries = 4 } = {}) {
    this.cookies = new Map();      // nome -> valor (PHPSESSID, PKG, ...)
    this.minDelayMs = minDelayMs;  // intervalo mínimo entre pedidos (educação + anti rate-limit)
    this.jitterMs = jitterMs;      // aleatoriedade para não parecer um relógio
    this.maxRetries = maxRetries;
    this._lastReqAt = 0;
  }

  // Recusa qualquer URL que caia num path proibido pelo robots.txt.
  static assertAllowed(url) {
    const path = new URL(url, BASE).pathname;
    if (ROBOTS_DISALLOW.some((p) => path.startsWith(p))) {
      throw new Error(`robots.txt proíbe: ${path}`);
    }
  }

  // Guarda os cookies recebidos (Set-Cookie) para os reenviar nos pedidos seguintes.
  _storeCookies(res) {
    // getSetCookie() devolve todos os headers Set-Cookie (Node 20+/undici).
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

  // Aplica o rate-limit: espera o tempo necessário desde o último pedido.
  async _throttle() {
    const wait = this._lastReqAt + this.minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    // jitter: 0..jitterMs de atraso extra aleatório.
    if (this.jitterMs) await sleep(Math.floor((Date.now() % 1000) / 1000 * this.jitterMs));
    this._lastReqAt = Date.now();
  }

  // fetchText: GET com throttle + retry/backoff.
  //
  // `validate(text)` é opcional: se devolver false, o resultado é tratado como
  // retryável (é assim que lidamos com o bloqueio intermitente do Cloudflare, que
  // responde 200 mas com uma página vazia/sem anúncios). Devolve o texto ou null se
  // esgotar as tentativas.
  async fetchText(url, { validate } = {}) {
    HttpClient.assertAllowed(url);
    let lastErr = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this._throttle();
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
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
      } catch (e) {
        lastErr = e.message;
      }
      // Backoff exponencial (1s, 2s, 4s, ...) antes da próxima tentativa.
      if (attempt < this.maxRetries) await sleep(1000 * 2 ** attempt);
    }
    console.warn(`  ⚠ falhou ${url} após ${this.maxRetries + 1} tentativas: ${lastErr}`);
    return null;
  }
}

export { BASE };
