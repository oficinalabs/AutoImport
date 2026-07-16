"use client";

import { CarImage } from "@/components/car-image";
import { CountryFlag } from "@/components/country-flag";
import { KmTrustBadge } from "@/components/km-trust-badge";
import { SavingsBadge } from "@/components/savings-badge";
import { Badge } from "@/components/ui/badge";
import { VerdictBadge } from "@/components/verdict-badge";
import { toggleFavorite } from "@/lib/data";
import { formatEuro, formatKm, relativeDay } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function CarCard({ listing }: { listing: Listing }) {
  const [fav, setFav] = useState(listing.isFavorite);
  // Só chega aqui pelos favoritos: a pesquisa nunca devolve anúncios mortos.
  const indisponivel = Boolean(listing.unavailableSince);

  async function onToggle(e: React.MouseEvent) {
    e.preventDefault();
    setFav((v) => !v); // optimistic
    await toggleFavorite(listing.id);
  }

  return (
    <Link
      href={`/anuncio/${listing.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[10px] border bg-surface transition-shadow",
        indisponivel
          ? "border-dashed border-line-strong"
          : "border-line hover:shadow-[0_8px_24px_-12px_rgba(14,59,74,.25)]",
      )}
    >
      <div className="relative">
        <CarImage
          label={listing.title}
          className={cn("aspect-[4/3] w-full", indisponivel && "opacity-40 grayscale")}
          rounded="rounded-none"
        />
        <div className="absolute left-2 top-2">
          {/* Num anúncio que já saiu do mercado, o veredito enganaria: dizer
              "compensa" sobre um carro que já não se pode comprar é pior do que
              não dizer nada. */}
          {indisponivel ? (
            <Badge className="bg-neutral-soft text-ink-soft shadow-sm backdrop-blur">
              Já não disponível
            </Badge>
          ) : (
            <VerdictBadge verdict={listing.verdict} className="shadow-sm backdrop-blur" />
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={fav ? "Remover dos favoritos" : "Guardar nos favoritos"}
          aria-pressed={fav}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-surface/90 text-ink-soft backdrop-blur transition-colors hover:text-bad"
        >
          <Heart className={cn("size-4", fav && "fill-bad text-bad")} />
        </button>
      </div>

      <div className={cn("flex flex-1 flex-col gap-3 p-3.5", indisponivel && "opacity-60")}>
        <div>
          <h3 className="font-display text-[15px] font-semibold leading-tight">{listing.title}</h3>
          <p className="mt-1 text-xs text-ink-soft">
            {listing.year} · <span className="tnum">{formatKm(listing.km)}</span>
          </p>
        </div>

        <div className="flex items-center justify-between text-xs text-ink-soft">
          <CountryFlag code={listing.country} />
          <span>{listing.source}</span>
        </div>

        {indisponivel ? (
          <p className="text-xs text-ink-soft">
            Sem sinal {relativeDay(listing.seenAt)}. Pode ter sido vendido ou retirado.
          </p>
        ) : (
          <KmTrustBadge trust={listing.kmTrust} />
        )}

        <div className="mt-auto flex items-end justify-between border-t border-line pt-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-soft">
              {indisponivel ? "Custo final estimado" : "Custo final em PT"}
            </div>
            <div className="tnum font-display text-lg font-bold">
              {formatEuro(listing.cost.totalPt)}
            </div>
          </div>
          {!indisponivel && (
            <SavingsBadge
              savings={listing.savings}
              savingsPct={listing.savingsPct}
              verdict={listing.verdict}
            />
          )}
        </div>
      </div>
    </Link>
  );
}
