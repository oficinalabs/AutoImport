import Link from "next/link";
import { country } from "@/lib/countries";
import { formatEuro, formatNumber } from "@/lib/format";
import type { CountryInsight } from "@/lib/types";

/** "Melhores países agora" — liga a dinâmica de país ao valor. */
export function CountryInsights({ insights }: { insights: CountryInsight[] }) {
  const max = Math.max(...insights.map((i) => i.avgSavings));
  return (
    <div className="flex flex-col gap-3">
      {insights.map((i) => {
        const c = country(i.country);
        return (
          <Link
            key={i.country}
            href={`/pesquisar?pais=${i.country}`}
            className="group flex items-center gap-3 text-sm"
          >
            <span className="flex w-24 shrink-0 items-center gap-1.5">
              <span aria-hidden>{c.flag}</span>
              <span className="group-hover:underline">{c.name}</span>
            </span>
            <span className="relative h-6 flex-1 overflow-hidden rounded-[4px] bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-[4px] bg-steel/25"
                style={{ width: `${(i.avgSavings / max) * 100}%` }}
              />
            </span>
            <span className="tnum w-28 shrink-0 text-right">
              <span className="font-mono font-semibold text-good">~{formatEuro(i.avgSavings)}</span>
              <span className="block text-[11px] text-ink-soft">
                {formatNumber(i.listingCount)} anúncios
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
