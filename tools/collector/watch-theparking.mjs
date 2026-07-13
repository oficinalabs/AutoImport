// watch-theparking.mjs — CLI da recolha CONTÍNUA do theparking.eu (polling de recentes).
//
// Faz poll da página de anúncios mais recentes de X em X tempo, deteta novos e mudanças
// de preço, e emite-os para o sink (hoje: NDJSON de eventos; futuro: upsert na DB).
//
// Uso:
//   node watch-theparking.mjs                              # 1 em 1 min, DE/NL/BE/FR
//   node watch-theparking.mjs --country belgium --make bmw
//   node watch-theparking.mjs --interval 60 --pages 1      # intervalo em segundos
//   node watch-theparking.mjs --interval 15 --cycles 3     # teste: 3 ciclos e sai
//
// Flags:
//   --country <slug|nome-pt>  país-alvo (repetível). Default: DE,NL,BE,FR.
//   --make <slug>             estreitar por marca.
//   --pages <n>               páginas de recentes por query (default 1).
//   --interval <seg>          intervalo entre ciclos (default 60).
//   --cycles <n>              nº de ciclos e termina (0/omisso = contínuo).
//   --rate <ms>               intervalo mínimo entre pedidos HTTP (default 1500).
//   --out <dir>               diretório de saída (default ./out).

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpClient } from './theparking/http.mjs';
import { watch } from './theparking/watch.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// Nomes de país (PT/EN) -> slug do theparking.eu.
const PAISES = {
  germany: 'germany', alemanha: 'germany',
  france: 'france', franca: 'france', 'frança': 'france',
  belgium: 'belgium', belgica: 'belgium', 'bélgica': 'belgium',
  netherlands: 'netherlands', holanda: 'netherlands', 'paises-baixos': 'netherlands',
  spain: 'spain', espanha: 'spain',
};

function parseArgs(argv) {
  const args = { country: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key === 'country') args.country.push(String(val).toLowerCase());
    else args[key] = val;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pedidos = args.country.length ? args.country : ['germany', 'netherlands', 'belgium', 'france'];
  const countries = [...new Set(pedidos.map((c) => PAISES[c]).filter(Boolean))];
  if (!countries.length) { console.error('✗ nenhum país válido. Ex.: --country belgium'); process.exit(1); }

  await watch({
    http: new HttpClient({ minDelayMs: Number(args.rate) || 1500 }),
    countries,
    make: args.make ? String(args.make) : null,
    pages: Number(args.pages) || 1,
    intervalMs: (Number(args.interval) || 60) * 1000,
    cycles: Number(args.cycles) || 0,
    outDir: args.out ? String(args.out) : join(__dir, 'out'),
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
