"use client";

import { cn } from "@/lib/utils";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import * as React from "react";

/**
 * Carrossel — a API do shadcn/ui (Carousel / CarouselContent / CarouselItem /
 * CarouselPrevious / CarouselNext) sobre o embla.
 *
 * ⚠️ Escrito à mão de propósito, em vez de `pnpm dlx shadcn add carousel`:
 * este projeto não tem `components.json`, e correr o `init` do shadcn
 * reescreveria o `app/globals.css` com os tokens por omissão dele — levando à
 * frente o sistema petróleo/âmbar inteiro. Os outros componentes em
 * `components/ui/` seguem a mesma regra.
 *
 * As setas não são decoração: sem elas o carrossel só se descobre a arrastar,
 * o que num rato não é óbvio. Ficam escondidas quando não há para onde ir.
 */

type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;

interface CarouselContextValue {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: CarouselApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
}

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const ctx = React.useContext(CarouselContext);
  if (!ctx) throw new Error("<CarouselContent> tem de estar dentro de <Carousel>");
  return ctx;
}

export function Carousel({
  opts,
  setApi,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  opts?: CarouselOptions;
  setApi?: (api: CarouselApi) => void;
}) {
  /**
   * ⚠️ `useMemo` obrigatório, não é otimização. O hook do embla faz `reInit()`
   * sempre que o objeto de opções muda de IDENTIDADE — e um literal escrito
   * aqui dentro (ou passado como `opts={{...}}` na chamada) é novo a cada
   * render, portanto o carrossel voltava ao princípio a cada mudança de estado.
   * Quem passar `opts` tem de passar uma referência estável (constante de
   * módulo), senão o defeito volta.
   */
  const options = React.useMemo(() => ({ align: "start" as const, ...opts }), [opts]);
  const [carouselRef, api] = useEmblaCarousel(options);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const onSelect = React.useCallback((a: CarouselApi) => {
    if (!a) return;
    setCanScrollPrev(a.canScrollPrev());
    setCanScrollNext(a.canScrollNext());
  }, []);

  const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = React.useCallback(() => api?.scrollNext(), [api]);

  React.useEffect(() => {
    if (!api) return;
    setApi?.(api);
    onSelect(api);
    api.on("reInit", onSelect).on("select", onSelect);
    return () => {
      api.off("reInit", onSelect).off("select", onSelect);
    };
  }, [api, onSelect, setApi]);

  return (
    <CarouselContext.Provider
      value={{ carouselRef, api, scrollPrev, scrollNext, canScrollPrev, canScrollNext }}
    >
      <section
        className={cn("relative", className)}
        aria-roledescription="carrossel"
        onKeyDownCapture={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            scrollPrev();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            scrollNext();
          }
        }}
        {...props}
      >
        {children}
      </section>
    </CarouselContext.Provider>
  );
}

export function CarouselContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { carouselRef } = useCarousel();
  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div className={cn("flex", className)} {...props} />
    </div>
  );
}

export function CarouselItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      className={cn("min-w-0 shrink-0 grow-0 basis-full", className)}
      {...props}
    />
  );
}

/** Base comum das duas setas. `hidden` quando não há para onde ir — um botão
 *  desativado a meio de um carrossel é ruído. */
function Seta({
  className,
  onClick,
  disabled,
  label,
  children,
}: {
  className?: string;
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full",
        "border border-white/20 bg-[#08090b]/70 text-white backdrop-blur",
        "transition hover:border-white/40 hover:bg-[#08090b]/90",
        disabled && "pointer-events-none opacity-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CarouselPrevious({ className }: { className?: string }) {
  const { scrollPrev, canScrollPrev } = useCarousel();
  return (
    <Seta
      onClick={scrollPrev}
      disabled={!canScrollPrev}
      label="Anterior"
      className={cn("-left-4", className)}
    >
      <ArrowLeft className="size-4" aria-hidden />
    </Seta>
  );
}

export function CarouselNext({ className }: { className?: string }) {
  const { scrollNext, canScrollNext } = useCarousel();
  return (
    <Seta
      onClick={scrollNext}
      disabled={!canScrollNext}
      label="Seguinte"
      className={cn("-right-4", className)}
    >
      <ArrowRight className="size-4" aria-hidden />
    </Seta>
  );
}
