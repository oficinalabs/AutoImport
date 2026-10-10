// lib/vat-regime-text.ts — o que um anúncio DE/NL/BE diz sobre o IVA (P04).
//
// PORQUÊ: o stand PT com n.º de IVA no VIES compra a líquido quando o vendedor está no regime
// normal ("MwSt. ausweisbar", "BTW verrekenbaar", "TVA déductible") e paga o preço cheio no
// regime da margem (§25a UStG, margeregeling, régime de la marge) ou a um particular. Os
// coletores traduzem as palavras do anúncio para o contrato do P01 (`vat_regime`, `price_net`);
// o sink (db-sink.ts) não adivinha.
//
// Regras (plano P04 e estudos DE §3.2, NL §3.2, BE §3.2 — 10/10/2026):
//  - Sem menção → null. NUNCA adivinhar 'dedutivel': o motor trata null como margem, o lado seguro.
//  - Menção de margem e de dedutível no mesmo anúncio → margem (outra vez o lado seguro).
//  - Vendedor particular → 'particular', seja o que for que o texto diga (não fatura IVA).
//  - "zzgl./exkl. MwSt.", "excl. BTW", "HTVA" junto ao preço: o preço anunciado JÁ é o líquido
//    (DE §3.2: "não dividir por 1,19"), e o vendedor está no regime normal.
// Fontes: DE-alemanha.md §3.2 (mobile.de/AutoScout24, https://www.autoscout24.de/lst/skoda/kodiaq/va_kodiaq-scout),
// NL-paises-baixos.md §3.2, BE-belgica.md §3.2. A lista de variantes não é exaustiva.

import { toInt } from './normalize.ts';

export type VatRegimeTexto = 'dedutivel' | 'margem';

// Margem / IVA não recuperável. Vem ANTES do dedutível: "MwSt. nicht ausweisbar" contém
// "ausweisbar", "BTW niet verrekenbaar" contém "verrekenbaar".
const MARGEM: RegExp[] = [
  /§\s*25\s*a\b/i,
  /differenzbesteuer/i,                                   // differenzbesteuert / Differenzbesteuerung
  /(?:mwst|ust|mehrwertsteuer)\.?\s+nicht\s+ausweisbar/i,
  /nicht\s+ausweisbare?\s+(?:mwst|ust|mehrwertsteuer)/i,
  /btw\s+niet\s+(?:verrekenbaar|aftrekbaar)/i,
  /\bmarge[-\s]?(?:auto|wagen|regeling)\b/i,
  /\bmargeregeling\b/i,
  /\bwinstmarge\b/i,
  /r[ée]gime\s+(?:de\s+la\s+|du\s+)?marge/i,
  /tva\s+non\s+(?:r[ée]cup[ée]rable|d[ée]ductible)/i,
  /margin\s+scheme/i,
  /\bmarge\b/i,                                           // "Marge" sozinho (NL/BE): por último
];

// Regime normal: o vendedor fatura com IVA e pode faturar a 0 % a um stand UE.
const DEDUTIVEL: RegExp[] = [
  /(?:mwst|ust|mehrwertsteuer)\.?\s+ausweisbar/i,
  /(?:mwst|ust|mehrwertsteuer)\.?\s+ausgewiesen/i,
  /ausweisbare[rn]?\s+(?:mwst|ust|mehrwertsteuer)/i,
  /inkl\.?\s+\d{1,2}\s*%\s*(?:mwst|ust)/i,                // "inkl. 19% MwSt." (DE §3.2); "inkl. MwSt." sozinho não chega
  /btw\s+(?:verrekenbaar|aftrekbaar)/i,
  /\bbtw[-\s]?(?:auto|wagen)\b/i,
  /tva\s+(?:r[ée]cup[ée]rable|d[ée]ductible)/i,
  /vat\s+(?:deductible|reclaimable|recoverable)/i,
  /iva\s+dedut[ií]vel/i,
  // preço escrito sem IVA = vendedor no regime normal (NL "prijs excl. BTW", BE "HTVA", DE "zzgl. MwSt.")
  /zzgl\.?\s+(?:\d{1,2}\s*%\s*)?(?:mwst|ust)/i,
  /(?:exkl|excl|exklusive)\.?\s+(?:\d{1,2}\s*%\s*)?(?:mwst|ust|btw|vat)/i,
  /\bhtva\b/i,
  /hors\s+tva/i,
  /\bsem\s+iva\b/i,
];

// O preço mostrado já é o líquido. Só se aplica ao RÓTULO do preço (não à descrição inteira,
// onde "netto" aparece em textos de financiamento — "Netto-Darlehensbetrag").
const PRECO_LIQUIDO: RegExp[] = [
  /zzgl\.?\s+(?:\d{1,2}\s*%\s*)?(?:mwst|ust)/i,
  /(?:exkl|excl|exklusive)\.?\s+(?:\d{1,2}\s*%\s*)?(?:mwst|ust|btw|vat)/i,
  /\bnetto\b/i,
  /\bhtva\b/i,
  /hors\s+tva/i,
  /\bsem\s+iva\b/i,                                       // autoline.pt: "1 850 € sem IVA"
];

// Preço líquido escrito no texto: "Netto: 16.807 €", "Nettopreis 16.807", "Prix HTVA : 16 807 €",
// "16.807 € excl. BTW", "€ 16.807,- netto".
const NUM = String.raw`(\d{1,3}(?:[.\s ]\d{3})+|\d{4,6})(?:,\d{1,2}|,-)?`;
const LIQUIDO_ANTES = new RegExp(String.raw`(?:netto(?:preis)?|nettopreis|net\s+price|prix\s+htva|prijs\s+excl\.?\s+btw|htva)\s*:?\s*(?:€|eur)?\s*${NUM}`, 'i');
const LIQUIDO_DEPOIS = new RegExp(String.raw`(?:€|eur)?\s*${NUM}\s*(?:€|eur)?\s*(?:netto\b|excl\.?\s+btw|htva|zzgl\.?\s+(?:\d{1,2}\s*%\s*)?mwst|exkl\.?\s+mwst)`, 'i');

function joinTexts(texts: unknown[]): string {
  return texts.filter((t) => t != null && t !== '').map(String).join(' \n ');
}

/** 'margem' | 'dedutivel' | null pelo vocabulário dos estudos. Margem ganha a dedutível. */
export function vatRegimeFromText(...texts: unknown[]): VatRegimeTexto | null {
  const t = joinTexts(texts);
  if (!t) return null;
  if (MARGEM.some((re) => re.test(t))) return 'margem';
  if (DEDUTIVEL.some((re) => re.test(t))) return 'dedutivel';
  return null;
}

/** true se o rótulo do preço diz que o valor mostrado é SEM IVA ("zzgl. MwSt.", "excl. BTW"). */
export function priceLabelIsNet(label: unknown): boolean {
  if (label == null) return false;
  return PRECO_LIQUIDO.some((re) => re.test(String(label)));
}

/** Preço líquido escrito no texto livre (EUR), ou null. */
export function netPriceFromText(...texts: unknown[]): number | null {
  const t = joinTexts(texts);
  if (!t) return null;
  const m = LIQUIDO_ANTES.exec(t) || LIQUIDO_DEPOIS.exec(t);
  return m ? toInt(m[1]) : null;
}

// ── Payloads estruturados (JSON das fontes) ─────────────────────────────────
// Os nomes exatos dos campos variam por fonte e não estão documentados: procuramos chaves
// com cara de "IVA dedutível" / "preço líquido" e textos com o vocabulário acima. Um booleano
// a false NÃO conclui margem (muitas APIs põem false por omissão) — fica "não diz".
const CHAVE_DEDUTIVEL = /^(?:is)?(?:vat|tax|mwst|btw|tva)_?(?:deductible|deductable|reclaimable|recoverable|ausweisbar|verrekenbaar|aftrekbaar)$/i;
const CHAVE_LIQUIDO = /^(?:net(?:to)?_?price|price_?net(?:to)?)(?:_?raw)?$/i;
const CHAVE_IVA = /(?:^|[^a-z])(?:vat|mwst|btw|tva)|^(?:tax|vat|mwst)(?!onomy)/i;
const MAX_DEPTH = 4;

function moneyOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (typeof v === 'string') return toInt(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.amountMinorUnits === 'number') return Math.round(o.amountMinorUnits / (Number(o.conversionMajor) || 100));
    return moneyOf(o.raw ?? o.amount ?? o.value ?? null);
  }
  return null;
}

export interface VatFromRaw { regime: VatRegimeTexto | null; netPrice: number | null }

/** Percorre um objeto da fonte à procura de sinais de IVA (booleanos, preço líquido, textos). */
export function vatFromRaw(raw: unknown): VatFromRaw {
  let flag = false;
  let netPrice: number | null = null;
  const texts: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (node == null || depth > MAX_DEPTH) return;
    if (typeof node === 'string') { texts.push(node); return; }
    if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
    if (typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (CHAVE_DEDUTIVEL.test(k) && v === true) flag = true;
      else if (CHAVE_LIQUIDO.test(k)) {
        const n = moneyOf(v);
        // `netPriceRaw` (número) ganha a `netPrice` (texto formatado) quando os dois existem.
        if (n != null && (netPrice == null || /raw$/i.test(k))) netPrice = n;
      } else if (typeof v === 'string' && CHAVE_IVA.test(k)) {
        // enums do tipo vatType: "VAT_DEDUCTIBLE" / "MARGIN" / "DIFFERENZBESTEUERT"
        if (/deduct|reclaim|recover|ausweisbar/i.test(v) && !/non|nicht|niet|not/i.test(v)) flag = true;
        else if (/margin|marge|differenz|25a/i.test(v)) texts.push('§25a');
        else texts.push(v);
      } else walk(v, depth + 1);
    }
  };
  walk(raw, 0);
  const fromText = vatRegimeFromText(...texts);
  // Margem escrita ganha a um booleano dedutível (lado seguro).
  const regime = fromText === 'margem' ? 'margem' : flag || fromText === 'dedutivel' ? 'dedutivel' : null;
  return { regime, netPrice };
}

export interface ResolveVatInput {
  /** objeto da fonte (ou parte dele) para procurar campos/textos de IVA */
  raw?: unknown;
  /** rótulo do preço tal como a fonte o mostra ("€ 20.990,-¹", "16.807 € zzgl. MwSt.") */
  priceLabel?: unknown;
  /** texto livre do anúncio (título, descrição, notas) */
  texts?: unknown[];
  /** vendedor particular declarado pela fonte */
  isPrivate?: boolean;
  /** preço anunciado (o que vai para `price`) */
  price?: number | null;
}

export interface VatFields { vat_regime: 'dedutivel' | 'margem' | 'particular' | null; price_net: number | null }

/**
 * Junta os sinais de um anúncio nos dois campos do contrato. Ordem: particular > margem >
 * dedutível > null. O preço líquido só fica quando o regime não é margem/particular.
 */
export function resolveVat({ raw, priceLabel, texts = [], isPrivate = false, price = null }: ResolveVatInput): VatFields {
  if (isPrivate) return { vat_regime: 'particular', price_net: null };
  const fromRaw = raw != null ? vatFromRaw(raw) : { regime: null, netPrice: null };
  const fromText = vatRegimeFromText(priceLabel, ...texts);
  const labelNet = priceLabelIsNet(priceLabel);
  if (fromRaw.regime === 'margem' || fromText === 'margem') return { vat_regime: 'margem', price_net: null };

  let net = fromRaw.netPrice ?? netPriceFromText(priceLabel, ...texts) ?? (labelNet ? price : null);
  if (net != null && price != null && net > price) net = null;   // líquido > bruto é lixo
  const dedutivel = fromRaw.regime === 'dedutivel' || fromText === 'dedutivel' || labelNet || net != null;
  return { vat_regime: dedutivel ? 'dedutivel' : null, price_net: dedutivel ? net : null };
}

/** Até 8 URLs http(s) sem repetidos (o sink volta a validar). Vazio → null. */
export function imageUrlList(urls: unknown[] | null | undefined): string[] | null {
  if (!Array.isArray(urls)) return null;
  const out = [...new Set(urls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)))].slice(0, 8);
  return out.length ? out : null;
}
