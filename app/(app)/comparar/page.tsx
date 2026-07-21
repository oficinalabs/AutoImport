import { CarImage } from "@/components/car-image";
import { CountryFlag } from "@/components/country-flag";
import { VerdictBadge } from "@/components/verdict-badge";
import { getListingsByIds } from "@/lib/data";
import { formatEuro, formatKm, formatPercent } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";

const ROWS: { label: string; get: (l: Listing) => string; highlight?: boolean }[] = [
  { label: "País", get: (l) => l.country },
  { label: "Ano", get: (l) => String(l.year) },
  { label: "Quilómetros", get: (l) => formatKm(l.km) },
  { label: "Preço na origem", get: (l) => formatEuro(l.cost.originPrice) },
  { label: "Transporte", get: (l) => formatEuro(l.cost.transport) },
  { label: "ISV", get: (l) => formatEuro(l.cost.isv) },
  { label: "Total em PT", get: (l) => formatEuro(l.cost.totalPt), highlight: true },
];

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const list = ids ? await getListingsByIds(ids.split(",")) : [];

  if (list.length < 2) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-ink-soft">Escolhe 2 a 4 anúncios na pesquisa para comparar.</p>
        <Link href="/pesquisar" className="text-sm font-medium text-petrol-ink hover:underline">
          Ir para a pesquisa
        </Link>
      </div>
    );
  }

  const bestSavings = Math.max(...list.map((l) => l.savings));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/pesquisar"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Voltar à pesquisa
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Comparar {list.length} carros</h1>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-2 p-3 text-left align-bottom" />
              {list.map((l) => {
                const winner = l.savings === bestSavings;
                return (
                  <th
                    key={l.id}
                    className={cn(
                      "min-w-[180px] p-3 text-left align-bottom",
                      winner ? "bg-good-soft" : "bg-surface-2",
                    )}
                  >
                    <Link href={`/anuncio/${l.id}`} className="block">
                      <CarImage
                        src={l.catalogImage}
                        label={l.title}
                        className="mb-2 aspect-[4/3] w-full"
                      />
                      <div className="flex items-center gap-1.5">
                        {winner && <Trophy className="size-4 text-good" />}
                        <span className="font-display font-semibold leading-tight hover:underline">
                          {l.title}
                        </span>
                      </div>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <td className="sticky left-0 bg-surface p-3 text-ink-soft">{row.label}</td>
                {list.map((l) => (
                  <td
                    key={l.id}
                    className={cn(
                      "p-3",
                      row.highlight ? "tnum font-mono font-semibold" : "",
                      l.savings === bestSavings && "bg-good-soft/40",
                    )}
                  >
                    {row.label === "País" ? <CountryFlag code={l.country} /> : row.get(l)}
                  </td>
                ))}
              </tr>
            ))}
            {/* Poupança */}
            <tr className="border-t border-line">
              <td className="sticky left-0 bg-surface p-3 text-ink-soft">Poupança</td>
              {list.map((l) => (
                <td
                  key={l.id}
                  className={cn("p-3", l.savings === bestSavings && "bg-good-soft/40")}
                >
                  <span className="tnum font-mono font-bold text-good">
                    −{formatEuro(l.savings)}
                  </span>
                  <span className="ml-1 text-xs text-ink-soft">
                    {formatPercent(l.savingsPct, false)}
                  </span>
                </td>
              ))}
            </tr>
            {/* Veredito */}
            <tr className="border-t border-line">
              <td className="sticky left-0 bg-surface p-3 text-ink-soft">Veredito</td>
              {list.map((l) => (
                <td
                  key={l.id}
                  className={cn("p-3", l.savings === bestSavings && "bg-good-soft/40")}
                >
                  <VerdictBadge verdict={l.verdict} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
