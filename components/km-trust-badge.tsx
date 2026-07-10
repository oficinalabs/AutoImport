import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { KmTrust } from "@/lib/types";
import { cn } from "@/lib/utils";

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
