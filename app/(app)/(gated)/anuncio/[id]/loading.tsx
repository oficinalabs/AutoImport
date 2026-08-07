import { Skeleton } from "@/components/skeleton";

/** Skeleton do detalhe: galeria + ficha à esquerda, dinheiro à direita. */
export default function AnuncioLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="A carregar anúncio">
      <Skeleton className="h-4 w-36" />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>

          {/* Galeria */}
          <div className="grid grid-cols-4 gap-2">
            <Skeleton className="col-span-4 aspect-[16/9] w-full" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>

          {/* Ficha técnica */}
          <div className="rounded-[10px] border border-line p-5">
            <Skeleton className="mb-4 h-4 w-32" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna do dinheiro */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 w-full rounded-[10px]" />
          <Skeleton className="h-64 w-full rounded-[10px]" />
          <Skeleton className="h-24 w-full rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}
