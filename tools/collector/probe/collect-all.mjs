// collect-all.mjs — orquestrador de recolha paralela CROSS-SITE, sem proxies.
//
// COMO: corre os coletores em paralelo ENTRE sites (hosts diferentes = seguro), cada site em
// SÉRIE ao seu ritmo seguro (medido pelo rate-probe). Modo batch --full → NDJSON em out/ (NUNCA
// toca na BD — o upsert só existe no watch/ingest). --resume torna cada site retomável.
//
// A concorrência é SÓ entre sites: um IP faz N streams em série, um por host — não martela host
// nenhum. É o ganho de velocidade seguro sem proxies (o gargalo real era correr 1 site de cada vez).
//
// SEGURANÇA DE DISCO: vigia o espaço livre; aborta novas fontes se cair abaixo de MIN_FREE_GB.
//
// Uso: node probe/collect-all.mjs [--tier core|mega|all] [--concurrency 5] [--out out]
//   --rates <file.json>  mapa { site: rateMs } (default: RATES abaixo, conservador)

import { spawn, execSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const COLLECTOR_DIR = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

const TIER = arg('--tier', 'core');
const CONCURRENCY = Number(arg('--concurrency', 5));
const OUT = arg('--out', join(COLLECTOR_DIR, 'out'));
const MIN_FREE_GB = 5;   // pára de arrancar fontes novas abaixo disto

// Ritmos seguros por defeito (ms) — CONSERVADORES (com margem sobre o limite medido). Um
// --rates <file> do rate-probe sobrepõe-se. Sites com Crawl-delay honram-no.
const RATES = {
  theparking: 700, autotrader: 350, autoboerse: 500, autocasion: 350, ocasionplus: 400,
  flexicar: 500, aramisauto: 5000, trovit: 500, meinauto: 500, quoka: 500, ooyyo: 30000,
  autoline: 700, autohero: 500, standvirtual: 700, olxpt: 700, custojusto: 500, autopt: 400,
  autosapo: 500, encontracarros: 700, santogal: 500, caetano: 700, carplus: 500,
  autoscout24: 500, autouncle: 700,
};

// Tiers. "core" = tudo o que é HTTP-puro e tratável em disco. "mega" = agregadores gigantes
// (autoscout24 pan-EU ~2,15M; autouncle multi-país). Separados por volume/disco/tempo.
const CORE = ['standvirtual', 'olxpt', 'custojusto', 'autopt', 'autosapo', 'encontracarros',
  'santogal', 'caetano', 'carplus', 'autoboerse', 'autocasion', 'ocasionplus', 'flexicar',
  'aramisauto', 'trovit', 'meinauto', 'quoka', 'ooyyo', 'autoline', 'autohero', 'theparking'];
const MEGA = ['autoscout24', 'autouncle'];
const SITES = TIER === 'mega' ? MEGA : TIER === 'all' ? [...CORE, ...MEGA] : CORE;

const ratesFile = arg('--rates', null);
const rates = ratesFile ? { ...RATES, ...JSON.parse(readFileSync(ratesFile, 'utf8')) } : RATES;

function freeGB() {
  try {
    const out = execSync(`df -Pk ${OUT}`, { encoding: 'utf8' }).trim().split('\n').pop();
    const avail = Number(out.split(/\s+/)[3]);   // KB
    return avail / 1024 / 1024;
  } catch { return Infinity; }
}

function runFull(site) {
  return new Promise((resolve) => {
    const rate = rates[site] ?? 1000;
    const t0 = Date.now();
    console.log(`▶ ${site} — --full @ ${rate}ms`);
    const child = spawn('node', [`run-${site}.ts`, '--full', '--resume', '--rate', String(rate),
      '--out', OUT], { cwd: COLLECTOR_DIR });
    let tail = '';
    const onData = (d) => { tail = (tail + d).split('\n').slice(-3).join('\n'); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => {
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`■ ${site} — terminou (código ${code}, ${mins} min)\n${tail.trim()}`);
      resolve({ site, code, mins: Number(mins) });
    });
  });
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      if (freeGB() < MIN_FREE_GB) { console.log(`⚠ disco < ${MIN_FREE_GB}GB — a parar novas fontes`); break; }
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out.filter(Boolean);
}

mkdirSync(OUT, { recursive: true });
console.log(`=== recolha tier=${TIER} · ${SITES.length} fontes · ${CONCURRENCY} em paralelo · out=${OUT} · livre=${freeGB().toFixed(0)}GB ===`);
const results = await pool(SITES, CONCURRENCY, runFull);
console.log('---DONE---');
console.log(JSON.stringify(results, null, 2));
