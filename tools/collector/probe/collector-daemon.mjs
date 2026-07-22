// collector-daemon.mjs — orquestrador de recolha CONTÍNUA para a máquina local (sem proxies).
//
// DOIS LOOPS (ver research/scrapers-python-migracao.md e memória operacao-recolha-continua):
//   1. FRESCURA — todos os watch-* em paralelo, contínuos, ritmos seguros. Modo NDJSON-ONLY
//      (COLLECTOR_NDJSON_ONLY=1): escrevem só para disco (events NDJSON), NÃO abrem ligações à BD.
//   2. COBERTURA — run-* --full por fonte em ROTAÇÃO (cada fonte a cada RECRAWL_DAYS=3 dias),
//      escalonado (poucas em paralelo), → NDJSON.
//
// A BD é escrita por UM SÓ processo: o pipeline (`pnpm pipeline:daily`), opt-in via --sync-db e
// com GUARDA DE TAMANHO (pausa acima de DB_LIMIT_MB). Ver o "porquê" no README/relatório: os 280k
// anúncios em disco NÃO cabem nos 500 MB da Supabase Free — o âmbito (PT completo? amostra UE?
// upgrade?) é decisão do dono. Por isso o sync está DESLIGADO por defeito.
//
// Uso:
//   node probe/collector-daemon.mjs                 # frescura + cobertura → disco (seguro)
//   node probe/collector-daemon.mjs --sync-db       # + ingest na BD (guardado por tamanho)
//   node probe/collector-daemon.mjs --only pt        # só as fontes PT
//   flags: --out <dir> --recrawl-days N --db-limit-mb N --sync-every-min N

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const COLLECTOR_DIR = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const OUT = arg('--out', join(COLLECTOR_DIR, 'out'));
const RECRAWL_DAYS = Number(arg('--recrawl-days', 3));
const DB_LIMIT_MB = Number(arg('--db-limit-mb', 450));   // pausa o ingest acima disto (500 é o teto)
const SYNC_EVERY_MIN = Number(arg('--sync-every-min', 60));
const SYNC_DB = has('--sync-db');
const ONLY = arg('--only', null);                         // 'pt' | 'eu' | null (todas)
const STATE = join(OUT, 'daemon-state.json');

// Fontes: ritmo seguro (ms, conservador vs o limite medido pelo probe), watch (pages/interval),
// e mercado (pt/eu). Stealth (piscapisca / autouncle de,it,es,uk) fora do default (venv/browser).
const SOURCES = [
  // PT — o mercado do produto
  { name: 'standvirtual', rate: 700, pages: 2, market: 'pt' },
  { name: 'olxpt', rate: 700, pages: 2, market: 'pt' },
  { name: 'custojusto', rate: 500, pages: 2, market: 'pt' },
  { name: 'autopt', rate: 400, pages: 2, market: 'pt' },
  { name: 'autosapo', rate: 500, pages: 3, market: 'pt' },
  { name: 'encontracarros', rate: 700, pages: 2, market: 'pt' },
  { name: 'santogal', rate: 500, pages: 2, market: 'pt' },
  { name: 'caetano', rate: 700, pages: 2, market: 'pt' },
  { name: 'carplus', rate: 500, pages: 2, market: 'pt' },
  // EU — comparação (amostra; ver âmbito/500MB)
  { name: 'autoboerse', rate: 500, pages: 2, market: 'eu' },
  { name: 'autocasion', rate: 350, pages: 2, market: 'eu' },
  { name: 'ocasionplus', rate: 400, pages: 2, market: 'eu' },
  { name: 'flexicar', rate: 500, pages: 2, market: 'eu' },
  { name: 'aramisauto', rate: 5000, pages: 1, market: 'eu' },
  { name: 'trovit', rate: 500, pages: 2, market: 'eu' },
  { name: 'meinauto', rate: 500, pages: 2, market: 'eu' },
  { name: 'quoka', rate: 500, pages: 2, market: 'eu' },
  { name: 'ooyyo', rate: 30000, pages: 1, market: 'eu' },
  { name: 'autoline', rate: 700, pages: 2, market: 'eu' },
  { name: 'autohero', rate: 500, pages: 2, market: 'eu' },
  { name: 'theparking', rate: 700, pages: 2, market: 'eu' },
  { name: 'autoscout24', rate: 500, pages: 2, market: 'eu' },
  { name: 'autouncle', rate: 700, pages: 2, market: 'eu' },
];

const sources = SOURCES.filter((s) => !ONLY || s.market === ONLY);
const now = () => new Date();
const iso = () => now().toISOString();
const log = (m) => console.log(`[${iso()}] ${m}`);

mkdirSync(OUT, { recursive: true });
let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { lastFull: {} };
const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

let stopping = false;
const children = new Set();
function stopAll() {
  stopping = true;
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* ignore */ } }
}
process.on('SIGINT', () => { log('SIGINT — a terminar…'); stopAll(); setTimeout(() => process.exit(0), 2000); });
process.on('SIGTERM', () => { stopAll(); setTimeout(() => process.exit(0), 2000); });

// ── LOOP 1: watch contínuo (NDJSON-only), com restart em caso de morte ──
function startWatch(s, delayMs) {
  if (stopping) return;
  setTimeout(() => {
    if (stopping) return;
    log(`▶ watch ${s.name} (rate ${s.rate}ms, ${s.pages} págs/ciclo)`);
    const child = spawn('node', [`watch-${s.name}.ts`,
      '--rate', String(s.rate), '--pages', String(s.pages), '--interval', '300', '--out', OUT],
      { cwd: COLLECTOR_DIR, env: { ...process.env, COLLECTOR_NDJSON_ONLY: '1' } });
    children.add(child);
    child.on('exit', (code) => {
      children.delete(child);
      if (stopping) return;
      log(`⚠ watch ${s.name} saiu (código ${code}) — reinício em 30s`);
      startWatch(s, 30000);   // auto-recuperação
    });
  }, delayMs);
}

// ── LOOP 2: re-crawl completo por fonte, em rotação (a cada RECRAWL_DAYS), poucas em paralelo ──
let recrawlActive = 0;
const RECRAWL_CONCURRENCY = 3;
function dueForRecrawl(s) {
  const last = state.lastFull[s.name];
  if (!last) return true;
  return (now() - new Date(last)) > RECRAWL_DAYS * 86400_000;
}
function runFull(s) {
  return new Promise((resolve) => {
    log(`⟳ re-crawl --full ${s.name}`);
    const t0 = Date.now();
    const child = spawn('node', [`run-${s.name}.ts`, '--full', '--resume',
      '--max-pages', '100000', '--rate', String(s.rate), '--out', OUT], { cwd: COLLECTOR_DIR });
    children.add(child);
    child.on('exit', (code) => {
      children.delete(child);
      state.lastFull[s.name] = iso();
      saveState();
      log(`✔ re-crawl ${s.name} terminou (código ${code}, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
      resolve();
    });
  });
}
async function recrawlTick() {
  if (stopping) return;
  for (const s of sources) {
    if (stopping) break;
    if (!dueForRecrawl(s)) continue;
    while (recrawlActive >= RECRAWL_CONCURRENCY && !stopping) await sleep(5000);
    if (stopping) break;
    recrawlActive++;
    runFull(s).finally(() => { recrawlActive--; });
  }
}

// ── ingest na BD (opt-in, guardado por tamanho). Único processo a escrever na BD. ──
function dbSizeMB() {
  try {
    const out = execFileSync('node', ['-e', `
      import('postgres').then(async ({default:pg})=>{try{process.loadEnvFile('${join(COLLECTOR_DIR, '../../.env.local')}');}catch{}
      const sql=pg(process.env.DATABASE_URL,{prepare:false,max:1});
      const [r]=await sql\`select pg_database_size(current_database()) b\`;console.log(Math.round(r.b/1048576));await sql.end();});
    `], { cwd: join(COLLECTOR_DIR, '../..'), encoding: 'utf8' });
    return Number(out.trim());
  } catch { return null; }
}
async function syncTick() {
  if (stopping || !SYNC_DB) return;
  const mb = dbSizeMB();
  if (mb == null) { log('⚠ sync: não consegui medir a BD — a saltar'); return; }
  if (mb >= DB_LIMIT_MB) { log(`⛔ sync PAUSADO: BD ${mb}MB ≥ limite ${DB_LIMIT_MB}MB (teto 500) — âmbito por decidir`); return; }
  log(`⇪ sync: BD ${mb}MB < ${DB_LIMIT_MB} — a correr pipeline:daily`);
  try {
    execFileSync('pnpm', ['pipeline:daily', '--dir', OUT], { cwd: join(COLLECTOR_DIR, '../..'), stdio: 'inherit' });
  } catch (e) { log(`⚠ sync: pipeline falhou: ${e.message}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── arranque ──
log(`daemon: ${sources.length} fontes · re-crawl ${RECRAWL_DAYS}d · sync-db=${SYNC_DB ? `ON (limite ${DB_LIMIT_MB}MB)` : 'OFF'} · out=${OUT}`);
sources.forEach((s, i) => startWatch(s, i * 3000));   // frescura, arranque escalonado
recrawlTick();                                         // cobertura, já
setInterval(recrawlTick, 3600_000);                    // e de hora a hora
if (SYNC_DB) { syncTick(); setInterval(syncTick, SYNC_EVERY_MIN * 60_000); }
