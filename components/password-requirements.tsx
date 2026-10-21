"use client";

import { PASSWORD_RULES, checkPassword } from "@/lib/password";
import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";

/**
 * Checklist de requisitos da password, atualizado enquanto se escreve.
 * As mesmas regras são impostas no servidor (lib/auth.ts) — isto é só UX.
 */
export function PasswordRequirements({ password }: { password: string }) {
  const touched = password.length > 0;
  // Regras todas cumpridas mas password recusada (palavra óbvia, demasiado longa):
  // sem esta linha o botão fica desligado sem explicação.
  const check = checkPassword(password);
  const rulesOk = PASSWORD_RULES.every((rule) => rule.test(password));
  const extra = touched && rulesOk && !check.valid ? check.message : undefined;

  return (
    <>
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
      {extra && (
        <p role="alert" className="text-xs text-bad">
          {extra}
        </p>
      )}
    </>
  );
}
