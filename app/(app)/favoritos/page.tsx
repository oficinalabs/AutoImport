import { CarCard } from "@/components/car-card";
import { getFavorites } from "@/lib/data";
import { Heart } from "lucide-react";
import Link from "next/link";

export default async function FavoritosPage() {
  const favorites = await getFavorites();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Favoritos</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Carros que guardaste para acompanhar preço e disponibilidade.
        </p>
      </div>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-line-strong py-16 text-center">
          <Heart className="size-8 text-ink-soft" />
          <p className="text-sm text-ink-soft">Ainda não guardaste nenhum carro.</p>
          <Link href="/pesquisar" className="text-sm font-medium text-petrol-ink hover:underline">
            Pesquisar carros
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favorites.map((l) => (
            <CarCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
