import { FlaskConical } from "lucide-react";

/**
 * Aviso de ambiente de demonstração — remover (ou condicionar a uma flag)
 * quando o backend ligar dados reais. Ver docs/07-FRONTEND-HANDOFF.md.
 */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-line bg-amber/10 px-4 py-1.5 text-center text-xs text-ink-soft">
      <FlaskConical className="size-3.5 shrink-0 text-amber-ink" />
      <span>
        <span className="font-semibold text-ink">Demonstração</span> — os dados são fictícios
        enquanto ligamos as fontes reais.
      </span>
    </div>
  );
}
