import { type KmAdvice, kmAdvice } from "@/lib/country-guides";
import type { CountryCode, KmCheck, KmTrust } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";

const CONFIG = {
  verificado: { icon: ShieldCheck, label: "Km verificado", tone: "text-good" },
  disponivel: { icon: ShieldQuestion, label: "Histórico disponível", tone: "text-steel" },
  por_verificar: { icon: ShieldAlert, label: "Km por verificar", tone: "text-warn" },
} as const;

/**
 * Sinal de confiança na quilometragem — importante pelo risco de fraude
 * em importados (ver research/paises-viaveis-importacao-2026.md).
 */
export function KmTrustBadge({ trust, className }: { trust: KmTrust; className?: string }) {
  const { icon: Icon, label, tone } = CONFIG[trust.level];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", tone, className)}>
      <Icon className="size-3.5" />
      {label}
      {trust.source && <span className="text-ink-soft">· {trust.source}</span>}
    </span>
  );
}

const ADVICE_TONE: Record<KmAdvice["tone"], { icon: typeof ShieldCheck; tone: string }> = {
  good: { icon: ShieldCheck, tone: "text-good" },
  bad: { icon: ShieldX, tone: "text-bad" },
  warn: { icon: ShieldAlert, tone: "text-warn" },
  info: { icon: ShieldQuestion, tone: "text-steel" },
};

/**
 * Onde confirmar os km deste carro, conforme o país e a idade, e o veredito do
 * registo oficial quando existe (ver `kmAdvice` em lib/country-guides.ts).
 */
export function KmTrustAdvice({
  country,
  year,
  kmCheck,
}: {
  country: CountryCode;
  year: number;
  kmCheck?: KmCheck;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {kmAdvice(country, year, kmCheck).map((a) => {
        const { icon: Icon, tone } = ADVICE_TONE[a.tone];
        return (
          <li key={a.text} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden />
            <span>{a.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
