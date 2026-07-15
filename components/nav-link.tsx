"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useLinkStatus } from "next/link";

/**
 * Item de navegação da top bar com feedback de carregamento.
 *
 * `useLinkStatus` (Next 15.3+) diz-nos se ESTE link está a navegar — o ícone
 * dá lugar a um spinner enquanto a página seguinte é obtida. Sem isto, clicar
 * num separador não dava sinal nenhum até a página trocar.
 */
export function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? "text-ink" : "text-ink-soft hover:text-ink",
      )}
    >
      <NavIcon icon={Icon} />
      <span className="hidden md:inline">{label}</span>
      {active && <span className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-amber" />}
    </Link>
  );
}

/** Tem de ser um filho do <Link> — o useLinkStatus lê o contexto dele. */
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="size-4 animate-spin text-amber" aria-hidden />
  ) : (
    <Icon className="size-4" />
  );
}
