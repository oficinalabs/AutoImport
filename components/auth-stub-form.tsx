"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Formulário de autenticação (apenas UI).
 *
 * TODO(backend): ligar ao Better Auth — substituir o onSubmit por uma
 * Server Action (signIn/signUp/resetPassword) mantendo estes campos.
 * Ver docs/03-BACKEND.md e docs/07-FRONTEND-HANDOFF.md.
 */
export function AuthStubForm({
  children,
  submitLabel,
  note = "A autenticação fica ativa quando o backend estiver ligado. Entretanto, explora a demonstração.",
}: {
  children: React.ReactNode;
  submitLabel: string;
  note?: string;
}) {
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="flex flex-col gap-4"
    >
      {children}
      {submitted && (
        <div className="flex gap-2 rounded-[8px] border border-line bg-surface-2 p-3 text-sm text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-steel" />
          <div>
            {note}{" "}
            <Link
              href="/painel"
              className="inline-flex items-center gap-1 font-medium text-petrol-ink hover:underline"
            >
              Abrir demonstração <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
      <Button type="submit" variant="accent" size="lg">
        {submitLabel}
      </Button>
    </form>
  );
}

export function Field({
  label,
  id,
  type = "text",
  placeholder,
  autoComplete,
  required = true,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="h-10 w-full rounded-[6px] border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
      />
    </div>
  );
}
