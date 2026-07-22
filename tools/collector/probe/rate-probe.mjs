// rate-probe.mjs — mede o ritmo mínimo SEGURO de cada fonte (onset de bloqueio), sem proxies.
//
// COMO: para cada fonte corre o coletor REAL em modo batch (NDJSON puro → NUNCA toca na BD) com
// --max-pages pequeno, a ritmos (--rate) decrescentes. Deteta bloqueio por (a) avisos "falhou"
// no output (403/página-vazia após retries) e (b) queda de registos face ao ritmo mais lento.
// Corre fontes em PARALELO (hosts diferentes = seguro) mas cada fonte com ritmos em SÉRIE.
//
// BOA CIDADANIA: honra o Crawl-delay do robots como PISO — não empurra mais rápido do que o site
// pede (ooyyo 30s, aramisauto 5s). Para nessas o "limite" É o crawl-delay. Para o resto, rampa
// até ~175ms (≈6 req/s) e PARA ao 1.º sinal de bloqueio (não insiste).
//
// Saída: uma linha JSON por (fonte, ritmo) para stdout + um resumo final. Corre com `node`.

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COLLECTOR_DIR = new URL('..', import.meta.url).pathname;

// Rampa base (ms, do mais lento p/ o mais rápido). Sites com Crawl-delay usam-no como piso.
const RAMP = [1500, 700, 350, 175];
const CONCURRENCY = 4;        // fontes em paralelo
const DEFAULT_MAX_PAGES = 3;

// floorMs: piso do ritmo (Crawl-delay do robots) — nunca provar mais rápido que isto.
// maxPages: override (encontracarros é 1 req/detalhe → páginas pequenas).
const SITES = [
  { name: 'theparking' },
  { name: 'autotrader' },
  { name: 'autoboerse' },
  { name: 'autocasion' },
  { name: 'ocasionplus' },
  { name: 'flexicar' },
  { name: 'aramisauto', floorMs: 5000 },   // robots Crawl-delay 5
  { name: 'trovit' },
  { name: 'meinauto' },
  { name: 'quoka' },
  { name: 'ooyyo', floorMs: 30000 },       // robots Crawl-delay 30
  { name: 'autoline' },
  { name: 'autohero' },
  { name: 'standvirtual' },
  { name: 'olxpt' },
  { name: 'custojusto' },
  { name: 'autopt' },
  { name: 'autosapo' },
  { name: 'encontracarros', maxPages: 1 }, // 1 req/anúncio de detalhe
  { name: 'santogal' },
  { name: 'caetano' },
  { name: 'carplus' },
  { name: 'autoscout24' },
  { name: 'autouncle' },                   // default market PT (HTTP puro)
];

function ratesFor(site) {
  const floor = site.floorMs ?? 0;
  const allowed = RAMP.filter((r) => r >= floor);
  return allowed.length ? allowed : [floor];   // se o piso > tudo, prova só ao piso
}

// Corre 1 crawl e devolve { records, warnings, secs, ok }.
function runOnce(site, rate, maxPages) {
  return new Promise((resolve) => {
    const out = mkdtempSync(join(tmpdir(), `probe-${site}-`));
    const t0 = Date.now();
    const child = spawn('node', [`run-${site}.ts`, '--max-pages', String(maxPages),
      '--rate', String(rate), '--out', out], { cwd: COLLECTOR_DIR });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.stderr.on('data', (d) => { buf += d; });
    child.on('close', () => {
      const secs = (Date.now() - t0) / 1000;
      let records = 0;
      try {
        for (const f of readdirSync(out)) {
          if (f.endsWith('.ndjson')) {
            const txt = readFileSync(join(out, f), 'utf8').trim();
            if (txt) records += txt.split('\n').length;
          }
        }
      } catch { /* ignore */ }
      // sinais de bloqueio: avisos de falha após retries (403/página-vazia)
      const warnings = (buf.match(/falhou|⚠|HTTP 4\d\d|HTTP 5\d\d|validação falhou/gi) || []).length;
      try { rmSync(out, { recursive: true, force: true }); } catch { /* ignore */ }
      resolve({ records, warnings, secs, reqRate: rate });
    });
  });
}

// Prova uma fonte: rampa descendente, para ao 1.º bloqueio. Devolve o melhor ritmo limpo.
async function probeSite(site) {
  const rates = ratesFor(site);
  const maxPages = site.maxPages ?? DEFAULT_MAX_PAGES;
  const results = [];
  let best = null, maxRecords = 0;
  for (const rate of rates) {
    const r = await runOnce(site.name, rate, maxPages);
    maxRecords = Math.max(maxRecords, r.records);
    // bloqueio: avisos > 0, OU 0 registos, OU queda >40% face ao melhor visto
    const dropped = maxRecords > 0 && r.records < 0.6 * maxRecords;
    const blocked = r.warnings > 0 || r.records === 0 || dropped;
    const line = {
      site: site.name, rateMs: rate, records: r.records, warnings: r.warnings,
      secs: Number(r.secs.toFixed(1)),
      reqPerSec: r.secs > 0 ? Number((r.records / r.secs).toFixed(1)) : 0,
      blocked,
    };
    results.push(line);
    console.log(JSON.stringify(line));
    if (blocked) break;         // não insistir — pára a rampa desta fonte
    best = rate;                // ritmo limpo mais rápido até agora
  }
  return { site: site.name, safeRateMs: best, floorMs: site.floorMs ?? null, results };
}

// Pool de concorrência entre fontes.
async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

const summary = await pool(SITES, CONCURRENCY, probeSite);
console.log('---SUMMARY---');
console.log(JSON.stringify(summary.map((s) => ({
  site: s.site, safeRateMs: s.safeRateMs, floorMs: s.floorMs,
  safeReqPerSec: s.safeRateMs ? Number((1000 / s.safeRateMs).toFixed(1)) : null,
})), null, 2));
