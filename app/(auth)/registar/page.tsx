import { SignUpForm } from "@/components/auth-forms";
import { getInvite } from "@/lib/data";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Criar conta — AutoImport" };

export default async function RegistarPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string }>;
}) {
  const { convite } = await searchParams;

  // Registo vindo de um convite: o email é o do convite e não se pergunta o
  // nome do stand. Se o convite não presta, quem explica porquê é a página do
  // convite — aqui não se inventa um registo normal por cima de um link roto.
  const invite = convite ? await getInvite(convite) : null;
  if (invite && invite.status !== "pendente") redirect(`/convite/${convite}`);

  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">
        {invite ? `Junta-te ao ${invite.standName}` : "Regista o teu stand"}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {invite
          ? "Cria a tua conta para entrares na equipa. A subscrição é do stand — não pagas nada."
          : "1.º mês grátis, sem cartão de crédito. Toda a equipa incluída."}
      </p>

      <div className="mt-5">
        <SignUpForm
          googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
          invite={
            invite ? { id: invite.id, email: invite.email, standName: invite.standName } : undefined
          }
        />
      </div>

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-soft">
        Já tens conta?{" "}
        <Link
          href={convite ? `/entrar?next=${encodeURIComponent(`/convite/${convite}`)}` : "/entrar"}
          className="font-medium text-petrol-ink hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
