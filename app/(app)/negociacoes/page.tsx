import { NegotiationsView } from "@/components/negotiations-view";
import { getConversations } from "@/lib/data";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";

export default async function NegociacoesPage() {
  const conversations = await getConversations();

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold">Negociações</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Fala com os vendedores sem expor o teu email — tudo pela plataforma.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-line-strong py-16 text-center">
          <MessagesSquare className="size-8 text-ink-soft" />
          <p className="text-sm font-medium">Ainda não tens negociações</p>
          <p className="max-w-sm text-sm text-ink-soft">
            Quando contactares um vendedor a partir de um anúncio, a conversa aparece aqui.
          </p>
          <Link
            href="/pesquisar"
            className="mt-1 text-sm font-medium text-petrol-ink hover:underline"
          >
            Ver oportunidades
          </Link>
        </div>
      </div>
    );
  }

  return <NegotiationsView conversations={conversations} />;
}
