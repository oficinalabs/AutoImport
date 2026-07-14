// cli-args.ts — parsing de argumentos específico do theparking.eu (partilhado run/watch).
//
// Outlier vs os outros coletores: --country é REPETÍVEL e aceita slug EN ou nome PT. Aqui
// resolvemos os nomes para slugs de URL (PAISES) e validamos; o resto do CLI usa `countries`.

// Nomes de país (PT/EN) -> slug usado no URL do theparking.eu.
const PAISES: Record<string, string> = {
  germany: 'germany', alemanha: 'germany',
  france: 'france', franca: 'france', 'frança': 'france',
  belgium: 'belgium', belgica: 'belgium', 'bélgica': 'belgium',
  netherlands: 'netherlands', holanda: 'netherlands', 'paises-baixos': 'netherlands',
  spain: 'spain', espanha: 'spain',
  // PT: a fatia `portugal` (`/used-cars/portugal.html`, ~128k anúncios) dá acesso por HTTP puro
  // ao inventário PT da rede leparking — o mesmo que o oparking.pt agregaria mas serve bloqueado
  // por Cloudflare challenge. Fontes reais: custojusto.pt, standvirtual.com, olx.pt, autohero.com.
  portugal: 'portugal', 'português': 'portugal', portugues: 'portugal',
};

export interface TheparkingArgs {
  country: string[];
  countries: string[];
  [key: string]: string | boolean | string[];
}

// Parser minimalista com --country repetível; resolve países p/ slug e valida (default: DE,NL,BE,FR).
export function parseArgs(argv: string[]): TheparkingArgs {
  const args: TheparkingArgs = { country: [], countries: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key === 'country') args.country.push(String(val).toLowerCase());
    else args[key] = val;
  }
  const pedidos = args.country.length ? args.country : ['germany', 'netherlands', 'belgium', 'france'];
  args.countries = [...new Set(pedidos.map((c) => PAISES[c]).filter(Boolean))];
  if (!args.countries.length) { console.error('✗ nenhum país válido. Ex.: --country belgium'); process.exit(1); }
  return args;
}
