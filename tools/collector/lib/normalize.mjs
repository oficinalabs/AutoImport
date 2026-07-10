// lib/normalize.mjs — normalizadores e schema-alvo COMUM a todos os coletores.
//
// PORQUÊ partilhado: todos os coletores (theparking, autotrader, …) produzem o mesmo
// registo normalizado, para comparar preços PT vs. UE de forma uniforme. Aqui ficam os
// campos-base e os normalizadores genéricos; cada site tem o seu próprio mapeamento
// (schema.mjs) que usa estes helpers.

// Campos-base comuns (ordem canónica). Cada site pode acrescentar extras próprios.
export const CAMPOS_BASE = [
  'make', 'model', 'variant', 'year', 'km', 'fuel', 'gearbox', 'engine',
  'color', 'doors', 'category', 'price', 'currency', 'country', 'region',
  'postalCode', 'source', 'detail_url', 'image', 'collected_at',
];

// toInt: extrai o inteiro de uma string com ruído ("217.828 km", "€ 1.975", "5 Doors").
// Devolve null se não houver dígitos (preferimos null a 0 para não falsear estatísticas).
export function toInt(v) {
  if (v == null) return null;
  const digits = String(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

// cleanStr: trim + colapso de espaços/quebras internas. Devolve null se ficar vazio.
export function cleanStr(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}
