/**
 * Stands espanhóis anunciam muitas vezes o preço FINANCIADO como preço de
 * montra; o preço de compra direta ("precio al contado") vive na descrição
 * do anúncio. Este parser extrai-o do texto da página de detalhe.
 *
 * Guardas: o contado tem de ser ≥ preço anunciado (financiado) e ≤ 1,4× —
 * fora disso é outro número qualquer da descrição e devolvemos null
 * (nunca adivinhar).
 */

const CONTADO_RE =
  /(?:precio\s+)?al\s+contado\s*[:\-–]?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})(?:,\d{2})?\s*(?:€|eur)?/gi;

export function parsePrecioContado(text: string, listedPrice: number): number | null {
  const candidates: number[] = [];
  for (const match of text.matchAll(CONTADO_RE)) {
    const value = Number(match[1].replace(/[.\s]/g, ""));
    if (Number.isFinite(value) && value >= listedPrice && value <= listedPrice * 1.4) {
      candidates.push(value);
    }
  }
  if (!candidates.length) return null;
  // várias ocorrências: o valor mais frequente; empate → o primeiro
  const freq = new Map<number, number>();
  for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
