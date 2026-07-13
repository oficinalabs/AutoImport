import { AuthStubForm, Field } from "@/components/auth-stub-form";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Recuperar password — AutoImport" };

export default function RecuperarPage() {
  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">Recuperar password</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Diz-nos o teu email e enviamos-te um link para definir uma nova password.
      </p>

      <div className="mt-5">
        <AuthStubForm
          submitLabel="Enviar link de recuperação"
          note="O envio de emails fica ativo quando o backend estiver ligado (Resend)."
        >
          <Field
            label="Email"
            id="email"
            type="email"
            placeholder="tu@stand.pt"
            autoComplete="email"
          />
        </AuthStubForm>
      </div>

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-soft">
        <Link href="/entrar" className="font-medium text-petrol-ink hover:underline">
          ← Voltar a entrar
        </Link>
      </p>
    </div>
  );
}
