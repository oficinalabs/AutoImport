import { Badge } from "@/components/ui/badge";
import type { Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";
import { VERDICT_DOT, VERDICT_LABEL, VERDICT_STYLE } from "@/lib/verdict";

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <Badge className={cn(VERDICT_STYLE[verdict], className)}>
      <span className={cn("size-2 rounded-full", VERDICT_DOT[verdict])} aria-hidden />
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}
