import { AuthStubForm, Field } from "@/components/auth-stub-form";
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
        <AuthStubForm
          submitLabel="Criar conta — 1.º mês grátis"
          note="A criação de contas fica disponível muito em breve — estamos a ligar a autenticação."
        >
          <Field
            label="Nome do stand"
            id="stand"
            placeholder="Stand Costa & Filhos"
            autoComplete="organization"
          />
          <Field label="O teu nome" id="nome" placeholder="Rui Costa" autoComplete="name" />
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
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
          />
        </AuthStubForm>
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
