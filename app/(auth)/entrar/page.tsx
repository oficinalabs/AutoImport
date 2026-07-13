import { AuthStubForm, Field } from "@/components/auth-stub-form";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Entrar — AutoImport" };

export default function EntrarPage() {
  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">Entrar</h1>
      <p className="mt-1 text-sm text-ink-soft">Bem-vindo de volta ao teu stand.</p>

      <div className="mt-5">
        <AuthStubForm submitLabel="Entrar">
          <Field
            label="Email"
            id="email"
            type="email"
            placeholder="tu@stand.pt"
            autoComplete="email"
          />
          <Field
            label="Password"
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <div className="text-right">
            <Link href="/recuperar" className="text-sm text-petrol-ink hover:underline">
              Esqueceste a password?
            </Link>
          </div>
        </AuthStubForm>
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
