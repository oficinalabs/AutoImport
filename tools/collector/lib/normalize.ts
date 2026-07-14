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
