import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</span>
        <Icon className={cn("size-4", accent ? "text-amber" : "text-steel")} />
      </div>
      <div className={cn("tnum mt-2 font-display text-2xl font-bold", accent && "text-good")}>
        {value}
      </div>
    </div>
  );
}
