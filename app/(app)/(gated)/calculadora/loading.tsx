import { Skeleton } from "@/components/skeleton";

/** Skeleton com a forma da calculadora: link, formulário e resultado. */
export default function CalculadoraLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="A carregar a calculadora">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
