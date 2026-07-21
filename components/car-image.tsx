import { cn } from "@/lib/utils";
import { Car } from "lucide-react";
import Image from "next/image";

/**
 * Foto do carro: renderiza `src` (imagem do catálogo ultimatespecs — o único
 * host autorizado em next.config → images.remotePatterns) via <Image>; sem
 * `src` mantém o placeholder de sempre. As fotos dos próprios anúncios
 * (hosts variados, hotlinking incerto) ficam para uma iteração futura.
 * Ver docs/07-FRONTEND-HANDOFF.md.
 */
export function CarImage({
  src,
  label,
  className,
  rounded = "rounded-[8px]",
}: {
  src?: string;
  label?: string;
  className?: string;
  rounded?: string;
}) {
  if (src) {
    return (
      <div className={cn("relative overflow-hidden bg-surface", rounded, className)}>
        <Image
          src={src}
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
