import { ResetPasswordForm } from "@/components/auth-forms";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Nova password — AutoImport" };

export default async function DefinirPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">Nova password</h1>
      <p className="mt-1 text-sm text-ink-soft">Define a password de acesso ao teu stand.</p>

      <div className="mt-5">
        {/* O Better Auth devolve ?error=INVALID_TOKEN quando o link expira. */}
        <ResetPasswordForm token={error ? undefined : token} />
      </div>

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-soft">
        <Link href="/entrar" className="font-medium text-petrol-ink hover:underline">
          ← Voltar a entrar
        </Link>
      </p>
    </div>
  );
}
