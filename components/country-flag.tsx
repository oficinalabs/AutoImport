import { country } from "@/lib/countries";
import type { CountryCode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CountryFlag({
  code,
  showName = true,
  className,
}: {
  code: CountryCode;
  showName?: boolean;
  className?: string;
}) {
  const c = country(code);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden>{c.flag}</span>
      {showName && <span>{c.name}</span>}
      {!showName && <span className="sr-only">{c.name}</span>}
    </span>
  );
}
