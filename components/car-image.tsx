"use client";

import { cn } from "@/lib/utils";
import { Car } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

/**
 * Foto do carro, por ordem de preferência:
 *
 * 1. `photo` — a **1.ª foto do próprio anúncio** (`Listing.images[0]`, já
 *    normalizada em lib/queries.ts). É um `<img>` normal, sem o optimizer do
 *    Next: os hosts são ~24 CDNs diferentes e cada fonte nova traria mais, o que
 *    obrigaria a editar o `images.remotePatterns` do next.config a cada coletor.
 *    `referrerPolicy="no-referrer"` para não vazar os nossos URLs para eles.
 * 2. `catalog` — a imagem do catálogo ultimatespecs (`Listing.catalogImage`), o
 *    único host autorizado no next.config → serve-se com `<Image>`. Entra
 *    quando o anúncio não tem foto ou quando a fonte bloqueia hotlinking
 *    (piscapisca.pt, ooyyo.com respondem 403/415).
 * 3. Sem nenhuma das duas — ou com a foto partida e sem catálogo — o
 *    placeholder de sempre.
 *
 * Ver docs/07-FRONTEND-HANDOFF.md.
 */
export function CarImage({
  photo,
  catalog,
  label,
  className,
  rounded = "rounded-[8px]",
}: {
  photo?: string;
  catalog?: string;
  label?: string;
  className?: string;
  rounded?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (photo?.startsWith("https://") && !broken) {
    return (
      <div className={cn("relative overflow-hidden bg-surface", rounded, className)}>
        <img
          src={photo}
          alt={label ? `Foto de ${label}` : ""}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      </div>
    );
  }

  if (catalog) {
    return (
      <div className={cn("relative overflow-hidden bg-surface", rounded, className)}>
        <Image
          src={catalog}
          alt={label ? `Foto de ${label}` : ""}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-petrol/10 to-steel/15 text-steel",
        rounded,
        className,
      )}
      aria-hidden={!label}
      role={label ? "img" : undefined}
      aria-label={label ? `Foto de ${label}` : undefined}
    >
      <Car className="size-8 opacity-40" strokeWidth={1.5} />
      {label && (
        <span className="pointer-events-none absolute bottom-1.5 left-2 right-2 truncate text-[11px] font-medium text-ink-soft">
          {label}
        </span>
      )}
    </div>
  );
}
