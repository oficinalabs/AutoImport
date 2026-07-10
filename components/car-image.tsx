import { Car } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Placeholder de foto de carro.
 *
 * O protótipo e o MVP não têm fotos reais. Quando o backend devolver
 * `Listing.images` com URLs, trocar este componente por <Image> do Next
 * (e adicionar os hosts em next.config.mjs → images.remotePatterns).
 * Ver docs/07-FRONTEND-HANDOFF.md.
 */
export function CarImage({
  label,
  className,
  rounded = "rounded-[8px]",
}: {
  label?: string;
  className?: string;
  rounded?: string;
}) {
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
