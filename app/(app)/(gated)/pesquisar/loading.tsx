import { Skeleton } from "@/components/skeleton";

/** Skeleton com a forma real da pesquisa: filtros, chips de país e grelha. */
export default function PesquisarLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="A carregar anúncios">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-10 w-full max-w-xs" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="ml-auto h-10 w-44" />
      </div>

      {/* Chips de país */}
      <div className="flex flex-wrap gap-2">
        {["de", "fr", "be", "nl", "es"].map((c) => (
          <Skeleton key={c} className="h-9 w-28 rounded-full" />
        ))}
      </div>

      {/* Grelha de anúncios */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-[10px] border border-line p-3">
            <Skeleton className="aspect-[4/3] w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-end justify-between border-t border-line pt-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
