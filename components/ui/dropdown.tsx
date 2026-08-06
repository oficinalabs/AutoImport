"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/**
 * Menu suspenso sobre `<details>` — com o comportamento que o `<details>` cru
 * não tem.
 *
 * Os três menus da barra de topo (países, sino, conta) eram `<details>` à mão, e
 * os três ficavam **abertos para sempre**: não fechavam com Escape, não fechavam
 * ao clicar fora, e ficavam abertos por cima da página seguinte depois de se
 * clicar num link lá dentro. Escrever a mesma correção três vezes era garantir
 * que uma delas ficava para trás.
 *
 * Continua a ser `<details>` e não um popover em JS: sem JS abre e fecha na
 * mesma, é acessível por teclado de graça, e o `summary` já é um botão para o
 * leitor de ecrã. O JS aqui só acrescenta o que falta.
 */
export function Dropdown({
  trigger,
  triggerClassName,
  triggerLabel,
  panelClassName,
  className,
  children,
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** `aria-label` do gatilho, para quando o conteúdo dele é só um ícone. */
  triggerLabel?: string;
  panelClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const fechar = () => {
      if (ref.current) ref.current.open = false;
    };

    function aoClicar(e: MouseEvent) {
      const el = ref.current;
      if (!el?.open) return;
      const alvo = e.target as Node;
      // Fora do menu: fecha. Dentro, só se for um link ou uma ação marcada —
      // senão clicar no cabeçalho do painel fechava-o. É também isto que trata
      // do "ficar aberto por cima da página seguinte": a barra de topo não
      // desmonta ao navegar, portanto sem isto o painel sobrevivia à navegação.
      if (!el.contains(alvo)) return fechar();
      if ((alvo as Element).closest?.("a,[data-fecha]")) fechar();
    }

    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape" || !ref.current?.open) return;
      fechar();
      // Devolver o foco ao gatilho: sem isto o foco fica num painel que já não
      // existe e a navegação por teclado perde-se.
      ref.current.querySelector("summary")?.focus();
    }

    document.addEventListener("click", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("click", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  return (
    <details ref={ref} className={cn("group relative", className)}>
      <summary
        aria-label={triggerLabel}
        className={cn(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          triggerClassName,
        )}
      >
        {trigger}
      </summary>
      <div
        className={cn(
          "absolute right-0 mt-1 rounded-[8px] border border-line bg-surface p-1 shadow-lg",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
