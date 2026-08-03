import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes tailwind com resolução de conflitos (padrão shadcn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O id vem do URL, logo pode ser qualquer coisa. As colunas de id são `uuid` no
 * Postgres, e comparar uma delas com texto que não é um uuid **não devolve zero
 * linhas: rebenta** (`invalid input syntax for type uuid`) — ou seja, um URL
 * malformado dava um 500 e um erro nos logs quando devia dar um 404 tranquilo.
 *
 * Filtra-se aqui, à entrada, e não nas queries: quem chama é que sabe o que
 * fazer com um id que não presta (a ficha do anúncio faz `notFound()`, o
 * comparador limita-se a ignorá-lo). A camada de dados fica com o contrato
 * simples de sempre — recebe ids, devolve anúncios.
 */
export function isUuid(v: string): boolean {
  return UUID.test(v);
}
