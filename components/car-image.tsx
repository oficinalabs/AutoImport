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
 * `prefer="catalog"` INVERTE 1 e 2. Serve para superfícies onde as fotos
 * aparecem **lado a lado** e a coerência vale mais do que a exatidão: as fotos
 * dos anúncios vêm de ~24 fontes e são um recorte de estúdio sobre branco ao
 * lado de uma foto de stand com pendão e marca de água por cima. Em fila, isso
 * lê-se como desleixo por muito bom que o cartão seja. As imagens de catálogo
 * são todas renders limpos do mesmo sítio.
 *
 * ⚠️ NÃO usar `prefer="catalog"` na página de detalhe do anúncio: aí a pessoa
 * está a avaliar AQUELE carro e precisa de ver AQUELE carro, não o modelo.
 *
 * Ver docs/07-FRONTEND-HANDOFF.md.
 */
export function CarImage({
  photo,
  catalog,
  label,
  className,
  rounded = "rounded-[8px]",
  prefer = "photo",
}: {
  photo?: string;
  catalog?: string;
  label?: string;
  className?: string;
  rounded?: string;
  prefer?: "photo" | "catalog";
}) {
  const [broken, setBroken] = useState(false);

  const daFoto = () => (
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

  const daCatalogo = () => (
    <div className={cn("relative overflow-hidden bg-surface", rounded, className)}>
      <Image
        src={catalog as string}
        alt={label ? `Foto de ${label}` : ""}
        fill
        sizes="(max-width: 768px) 100vw, 400px"
        className="object-cover"
      />
    </div>
  );

  const fotoUsavel = Boolean(photo?.startsWith("https://")) && !broken;

  // A preferência só se aplica quando a alternativa existe — nunca degrada
  // para o placeholder por causa dela.
  if (prefer === "catalog" && catalog) return daCatalogo();
  if (fotoUsavel) return daFoto();
  if (catalog) return daCatalogo();

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
