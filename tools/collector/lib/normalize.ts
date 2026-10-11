// lib/normalize.ts — normalizadores e schema-alvo COMUM a todos os coletores.
//
// PORQUÊ partilhado: todos os coletores (theparking, autotrader, …) produzem o mesmo
// registo normalizado, para comparar preços PT vs. UE de forma uniforme. Aqui ficam os
// campos-base e os normalizadores genéricos; cada site tem o seu próprio mapeamento
// (schema.ts) que usa estes helpers.

// Campos-base comuns (ordem canónica). Cada site pode acrescentar extras próprios.
export const CAMPOS_BASE = [
  'make', 'model', 'variant', 'year', 'km', 'fuel', 'gearbox', 'engine',
  'color', 'doors', 'category', 'price', 'currency', 'country', 'region',
  'postalCode', 'source', 'detail_url', 'image', 'collected_at',
] as const;

// CollectorRecord — o registo normalizado COMUM a todos os coletores (os 20 CAMPOS_BASE).
// É o contrato verificável pelo compilador: cada coletor define o seu `<X>Record extends
// CollectorRecord` com os extras próprios do site. Alinha com lib/types.ts do frontend.
export interface CollectorRecord {
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  km: number | null;
  fuel: string | null;
  gearbox: string | null;
  engine: string | number | null;
  color: string | null;
  doors: number | null;
  category: string | null;
  price: number | null;
  currency: string;
  country: string | null;
  region: string | null;
  postalCode: string | null;
  source: string | null;
  detail_url: string | null;
  image: string | null;
  collected_at: string | null;
  // ── Opcionais (P01): só os coletores que os sabem ler os preenchem. O sink
  // (lib/db-sink.ts) grava-os com coalesce — um re-crawl sem o campo não apaga o valor.
  /** o que o anúncio diz do IVA: 'dedutivel' ("MwSt. ausweisbar", "TVA récupérable",
   *  "BTW verrekenbaar", "IVA deducible") | 'margem' (§25a, REBU, margeregeling) |
   *  'particular'. Ausente/null = o anúncio não diz. */
  vat_regime?: VatRegimeAnuncio | null;
  /** preço SEM IVA quando a fonte o publica ("Netto", "HTVA", "excl. BTW"), EUR */
  price_net?: number | null;
  /** até 8 URLs de fotos (a 1.ª continua também em `image`). Chama-se `image_urls` e
   *  não `images` porque vários coletores já usam `images` para a CONTAGEM de fotos. */
  image_urls?: string[] | null;
  /** matrícula visível no anúncio (só NL, para a RDW); fica no warehouse */
  plate?: string | null;
  /** veredito de um registo oficial de km (ex.: RDW/NAP) */
  km_check?: KmCheckRegisto | null;
}

export type VatRegimeAnuncio = 'dedutivel' | 'margem' | 'particular';

// Igual a KmCheck em lib/types.ts (os coletores não importam do frontend).
export interface KmCheckRegisto {
  source: 'RDW' | 'Car-Pass' | 'HistoVec' | 'DGT';
  verdict: 'coerente' | 'incoerente' | 'sem_juizo';
  checkedAt: string;
}

// toInt: extrai o inteiro de uma string com ruído ("217.828 km", "€ 1.975", "5 Doors").
// Devolve null se não houver dígitos (preferimos null a 0 para não falsear estatísticas).
export function toInt(v: unknown): number | null {
  if (v == null) return null;
  const digits = String(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// cleanStr: trim + colapso de espaços/quebras internas. Devolve null se ficar vazio.
export function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}
