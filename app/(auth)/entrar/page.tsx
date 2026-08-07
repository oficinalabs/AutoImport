import { SignInForm } from "@/components/auth-forms";
import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Entrar — AutoImport" };

/**
 * Para onde voltar depois de entrar. Só rotas **internas**: um `next` com
 * `//` ou `http://` era um redirect aberto para fora do site. O middleware já
 * põe este parâmetro quando corta o acesso a uma rota da app; a página do
 * convite põe-no para se voltar ao convite.
 */
function safeNext(next: string | undefined): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return undefined;
  }
  return next;
}

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string }>;
}) {
  const { reset, next } = await searchParams;

  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">Entrar</h1>
      <p className="mt-1 text-sm text-ink-soft">Bem-vindo de volta ao teu stand.</p>

      {reset && (
        <div className="mt-4 flex items-start gap-2 rounded-[8px] border border-good/30 bg-good-soft p-3 text-sm text-good">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          <span>Password alterada. Já podes entrar com a nova.</span>
        </div>
      )}

      <div className="mt-5">
        <SignInForm
          googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
          next={safeNext(next)}
        />
      </div>

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-soft">
        Ainda não tens conta?{" "}
        <Link href="/registar" className="font-medium text-petrol-ink hover:underline">
          Regista o teu stand
        </Link>
      </p>
    </div>
  );
}
