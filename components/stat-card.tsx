import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

/**
 * Cartão de KPI. Com `href`, torna-se clicável e leva a uma listagem já
 * filtrada que "explica" o número (ex.: "A compensar agora" → a pesquisa só com
 * oportunidades). A seta ↗ no hover assina que é clicável.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
        {href ? (
          <ArrowUpRight className="size-4 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100" />
        ) : (
          <Icon className={cn("size-4", accent ? "text-amber" : "text-steel")} />
        )}
      </div>
      <div className={cn("tnum mt-2 font-display text-2xl font-bold", accent && "text-good")}>
        {value}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group rounded-[10px] border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-2"
      >
        {inner}
      </Link>
    );
  }

  return <div className="rounded-[10px] border border-line bg-surface p-4">{inner}</div>;
}
