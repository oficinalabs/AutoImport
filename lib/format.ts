/** Formatação PT — euros, números, datas, percentagens. */

const eur = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurCents = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("pt-PT");

/** €26 650 (sem cêntimos, o normal para preços de carros). */
export function formatEuro(value: number): string {
  return eur.format(value);
}

/** €99,00 (com cêntimos — subscrição, etc.). */
export function formatEuroCents(value: number): string {
  return eurCents.format(value);
}

/** 45 000 */
export function formatNumber(value: number): string {
  return num.format(value);
}

/** 45 000 km */
export function formatKm(value: number): string {
  return `${num.format(value)} km`;
}

/** 1498 cm³ */
export function formatCc(value: number): string {
  return `${num.format(value)} cm³`;
}

/** -11% / +4% */
export function formatPercent(value: number, withSign = true): string {
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

/** "há 2 dias", "hoje", "ontem" — datas relativas simples em PT. */
export function relativeDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor(
    (today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 7) return `há ${diff} dias`;
  if (diff < 30) return `há ${Math.floor(diff / 7)} semana(s)`;
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

/** 10 jul 2026 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
