import { formatEuro, formatKm, formatNumber } from "@/lib/format";
import type { PtComparable } from "@/lib/types";
import { ExternalLink } from "lucide-react";

/**
 * Os anúncios portugueses com que a estimativa do preço PT se comparou
 * (`Listing.ptSample`, até 8). Antes de o pipeline os gravar não há lista, só o
 * tamanho da amostra.
 */
export function PtComparables({
  sample,
  sampleSize,
}: {
  sample?: PtComparable[];
  sampleSize: number;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Carros portugueses comparados
      </h2>
      {sample && sample.length > 0 ? (
        <>
          <p className="mb-3 text-xs text-ink-soft">
            {sample.length < sampleSize
              ? `${sample.length} dos ${formatNumber(sampleSize)} anúncios da amostra.`
              : `Os ${formatNumber(sample.length)} anúncios da amostra.`}
          </p>
          <ul className="flex flex-col">
            {sample.map((c) => (
              <li
                key={`${c.source}-${c.url ?? c.title}-${c.price}-${c.km}`}
                className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex max-w-full items-center gap-1 font-medium hover:text-petrol-ink"
                    >
                      <span className="truncate">{c.title}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <span className="block truncate font-medium">{c.title}</span>
                  )}
                  <span className="text-xs text-ink-soft">
                    {c.year} · {formatKm(c.km)} · {c.source}
                  </span>
                </div>
                <span className="tnum shrink-0 font-mono">{formatEuro(c.price)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-ink-soft">
          A estimativa usou {formatNumber(sampleSize)} anúncios portugueses do mesmo modelo, ano e
          quilometragem parecidos. A lista ainda não está disponível para este carro.
        </p>
      )}
    </div>
  );
}
