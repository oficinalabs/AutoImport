// autouncle/stealth.ts — transporte "stealth" (browser) para os domínios AutoUncle com Cloudflare
// ATIVO (de, it, es, uk). Lado Node do bridge; o motor é o daemon Python stealth_fetch.py (Camoufox).
//
// PORQUÊ: 10 dos 14 domínios passam a HTTP puro (o HttpClient normal); 4 devolvem 403 a qualquer
// cliente não-browser. Em vez de reimplementar o parse em Python, trocamos SÓ o transporte: o
// `StealthHttpClient` tem a MESMA interface do HttpClient (`fetchText`/`fetchJson`/`forMarket` +
// a guarda robots herdada), mas em vez de `fetch()` delega no daemon, que resolve o Cloudflare com
// uma sessão Camoufox quente. O HTML volta cru e entra no MESMO parse.ts/schema.ts/checkpoint.
//
// UMA `StealthBridge` (um processo Python, uma sessão) serve todos os mercados stealth de um run —
// a sessão resolve o challenge de cada domínio na 1.ª visita e reutiliza o cf_clearance. O crawl
// cria a bridge à 1.ª necessidade e fecha-a no fim.

import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { HttpClient, type Market } from './http.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const VENV_PYTHON = join(HERE, '.venv', 'bin', 'python');
const DAEMON = join(HERE, 'stealth_fetch.py');

interface BridgeResponse { status: number; b64?: string; error?: string; }
interface BridgeOptions { minDelayMs?: number; jitterMs?: number; maxRetries?: number; headless?: boolean; }

// Dono do processo Python. Serializa nada (o daemon processa STDIN em ordem e responde em ordem);
// casa respostas do FD 3 às promessas pendentes por FIFO.
export class StealthBridge {
  private proc: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private pending: { resolve: (r: BridgeResponse) => void; reject: (e: Error) => void }[] = [];
  private buf = '';
  private opts: BridgeOptions;

  constructor(opts: BridgeOptions = {}) { this.opts = opts; }

  // Arranca o daemon (idempotente). Rejeita com instrução clara se o venv não existir.
  start(): Promise<void> {
    if (this.ready) return this.ready;
    if (!existsSync(VENV_PYTHON)) {
      return Promise.reject(new Error(
        `venv stealth em falta: ${VENV_PYTHON}\n`
        + `  Instalar (uma vez): cd ${HERE} && python3.13 -m venv .venv `
        + `&& .venv/bin/pip install -r requirements.txt && .venv/bin/scrapling install`));
    }
    this.ready = new Promise<void>((resolve, reject) => {
      // stdio: [stdin=pipe, stdout=ignore, stderr=herda (logs do browser), fd3=pipe (protocolo)]
      const proc = spawn(VENV_PYTHON, [DAEMON], {
        stdio: ['pipe', 'ignore', 'inherit', 'pipe'],
        env: {
          ...process.env,
          AU_MIN_DELAY_MS: String(this.opts.minDelayMs ?? 4000),
          AU_JITTER_MS: String(this.opts.jitterMs ?? 1200),
          AU_MAX_RETRIES: String(this.opts.maxRetries ?? 3),
          AU_HEADLESS: this.opts.headless === false ? '0' : '1',
        },
      });
      this.proc = proc;
      process.once('exit', () => this.close());   // não deixa o Camoufox órfão se o pai sair/Ctrl-C
      const fd3 = proc.stdio[3] as NodeJS.ReadableStream;
      fd3.setEncoding('utf8');
      fd3.on('data', (chunk: string) => this.onData(chunk, resolve));
      proc.on('exit', (code) => {
        const err = new Error(`daemon stealth terminou (código ${code})`);
        if (this.pending.length) { this.pending.forEach((p) => p.reject(err)); this.pending = []; }
        reject(err);   // no-op se já resolvido
      });
      proc.on('error', reject);
    });
    return this.ready;
  }

  private onData(chunk: string, onReady: () => void) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let obj: BridgeResponse & { ready?: boolean };
      try { obj = JSON.parse(line); } catch { continue; }   // ruído improvável no FD dedicado
      if (obj.ready) { onReady(); continue; }
      const p = this.pending.shift();
      if (p) p.resolve(obj);
    }
  }

  // Pede uma página ao daemon; devolve { status, body|null }.
  async fetch(url: string): Promise<{ status: number; body: string | null; error?: string }> {
    await this.start();
    const resp = await new Promise<BridgeResponse>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.proc!.stdin!.write(JSON.stringify({ url }) + '\n');
    });
    if (resp.b64 != null) return { status: resp.status, body: Buffer.from(resp.b64, 'base64').toString('utf8') };
    return { status: resp.status, body: null, error: resp.error };
  }

  close() {
    if (this.proc) { try { this.proc.stdin?.end(); this.proc.kill(); } catch { /* ignore */ } this.proc = null; }
  }
}

// Cliente HTTP com a interface do HttpClient, mas cujo transporte é a StealthBridge. Herda a guarda
// robots (assertAllowed), o Accept-Language e o baseUrl do mercado; só troca fetchText/fetchJson.
export class StealthHttpClient extends HttpClient {
  private bridge: StealthBridge;

  constructor(market: Market, bridge: StealthBridge) {
    super({ market });           // baseUrl/robots/acceptLanguage do mercado (throttle/retry vivem no daemon)
    this.bridge = bridge;
  }

  // Partilha a MESMA bridge entre mercados stealth (uma sessão Camoufox p/ todos).
  forMarket(market: Market): StealthHttpClient {
    if (market.code === this.market.code) return this;
    return new StealthHttpClient(market, this.bridge);
  }

  async fetchText(url: string, { validate }: { validate?: (t: string) => boolean } = {}): Promise<string | null> {
    this.assertAllowed(url);
    const { status, body, error } = await this.bridge.fetch(url);
    if (body == null) { console.warn(`  ⚠ stealth falhou ${url}: ${error || `HTTP ${status}`}`); return null; }
    if (validate && !validate(body)) { console.warn(`  ⚠ stealth validação falhou ${url} (challenge/página vazia?)`); return null; }
    return body;
  }

  async fetchJson(url: string): Promise<unknown> {
    this.assertAllowed(url);
    const { status, body, error } = await this.bridge.fetch(url);
    if (body == null) { console.warn(`  ⚠ stealth falhou json ${url}: ${error || `HTTP ${status}`}`); return null; }
    try { return JSON.parse(body); } catch { console.warn(`  ⚠ stealth resposta sem JSON ${url}`); return null; }
  }
}
