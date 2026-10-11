// lib/vat-text-es.ts — o que o TEXTO de um anúncio ES diz sobre o IVA, e a galeria de fotos (P05).
//
// Para as fontes sem campo estruturado (Autocasión, Trovit) o regime só se vê na descrição/card.
// Vocabulário do estudo ES §3.2 (plano de implementação, 10/10/2026); REBU = LIVA arts. 135–139,
// https://www.boe.es/eli/es/l/1992/12/28/37/con. A única fonte FR do P05 (Aramisauto) não mostra
// regime nenhum (estudo FR §3.2), por isso não há aqui vocabulário francês.
//
// Regras:
//   - menção de margem ("REBU", "IVA no deducible"…) GANHA a uma de dedutível no
//     mesmo texto: é o lado seguro (ex.: "IVA incluido (REBU), factura con IVA").
//   - sem menção → null (nunca adivinhar 'dedutivel'; o motor trata null como margem).
//   - preço líquido só quando o texto o escreve COM valor ("15.900 € + IVA", "precio sin IVA: 13.140 €").

import { toInt } from './normalize.ts';

export interface VatFromText {
  regime: 'dedutivel' | 'margem' | null;
  priceNet: number | null;
}

// ES §3.2 "Palavras exatas a detetar".
const ES_MARGEM = /\bREBU\b|r[eé]gimen especial de (?:los )?bienes usados|IVA\s+no\s+deducible|no se desglosa el IVA/i;
const ES_DEDUTIVEL = /\bI\.?V\.?A\.?\s*deducible\b|IVA\s+desglosado|factura con IVA|precio\s*\+\s*IVA|precio sin IVA|IVA no incluido|exportaci[oó]n sin IVA|venta a profesionales UE/i;

// Valor + marcador de líquido, nos dois sentidos: "15.900 € + IVA" / "precio sin IVA: 15.900 €".
const NUM = String.raw`(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,\d{2})?\s*€?`;
const ES_NET = [
  new RegExp(String.raw`${NUM}\s*(?:\+\s*IVA|sin IVA|IVA no incluido)`, 'i'),
  new RegExp(String.raw`(?:precio sin IVA|base imponible)\s*:?\s*${NUM}`, 'i'),
];

export function vatFromTextEs(text: string | null | undefined): VatFromText {
  if (!text) return { regime: null, priceNet: null };
  if (ES_MARGEM.test(text)) return { regime: 'margem', priceNet: null };
  if (!ES_DEDUTIVEL.test(text)) return { regime: null, priceNet: null };
  for (const re of ES_NET) {
    const m = re.exec(text);
    const n = m ? toInt(m[1]) : null;
    if (n != null && n > 0) return { regime: 'dedutivel', priceNet: n };
  }
  return { regime: 'dedutivel', priceNet: null };
}

// Galeria: até 8 URLs http(s), sem repetidos, por ordem. Aceita strings ou objetos {url|src}
// (as fontes variam) e URLs protocolo-relativas ("//img…" → https). Vazio → null.
export const MAX_FOTOS = 8;
export function galleryUrls(raw: unknown): string[] | null {
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const urls: string[] = [];
  for (const item of list) {
    const v = typeof item === 'string' ? item
      : item && typeof item === 'object' ? ((item as { url?: unknown }).url ?? (item as { src?: unknown }).src) : null;
    if (typeof v !== 'string') continue;
    const u = v.trim().replace(/^\/\//, 'https://');
    if (/^https?:\/\//.test(u) && !urls.includes(u)) urls.push(u);
    if (urls.length === MAX_FOTOS) break;
  }
  return urls.length ? urls : null;
}
