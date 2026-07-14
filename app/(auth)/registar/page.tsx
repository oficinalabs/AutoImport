import { SignUpForm } from "@/components/auth-forms";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Criar conta — AutoImport" };

export default function RegistarPage() {
  return (
    <div className="rounded-[12px] border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">Regista o teu stand</h1>
      <p className="mt-1 text-sm text-ink-soft">
        1.º mês grátis, sem cartão de crédito. Toda a equipa incluída.
      </p>

      <div className="mt-5">
        <SignUpForm />
      </div>

      <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-soft">
        Já tens conta?{" "}
        <Link href="/entrar" className="font-medium text-petrol-ink hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
