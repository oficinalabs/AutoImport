"use client";

import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";

/**
 * Checklist de requisitos da password, atualizado enquanto se escreve.
 * As mesmas regras são impostas no servidor (lib/auth.ts) — isto é só UX.
 */
export function PasswordRequirements({ password }: { password: string }) {
  const touched = password.length > 0;

  return (
    <ul className="flex flex-col gap-1" aria-label="Requisitos da password">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              ok ? "text-good" : touched ? "text-ink-soft" : "text-ink-soft/70",
            )}
          >
            {ok ? (
              <Check className="size-3.5 shrink-0" />
            ) : (
              <Circle className="size-3.5 shrink-0" />
            )}
            <span>{rule.label}</span>
            {ok && <span className="sr-only">cumprido</span>}
          </li>
        );
      })}
    </ul>
  );
}
