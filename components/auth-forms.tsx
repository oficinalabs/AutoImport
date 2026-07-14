"use client";

import { Button } from "@/components/ui/button";
import { authClient, signIn, signUp } from "@/lib/auth-client";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Mensagem de erro em PT a partir do erro do Better Auth. */
function messageFor(error: { code?: string; message?: string } | null | undefined): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email ou password incorretos.";
    case "USER_ALREADY_EXISTS":
      return "Já existe uma conta com este email.";
    case "PASSWORD_TOO_SHORT":
      return "A password tem de ter pelo menos 8 caracteres.";
    default:
      return error?.message ?? "Ocorreu um erro. Tenta novamente.";
  }
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
  return `${base || "stand"}-${Math.random().toString(36).slice(2, 7)}`;
}

function Field({
  label,
  id,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="h-10 w-full rounded-[6px] border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
      />
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    const { error } = await signIn.email({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    if (error) {
      setError(messageFor(error));
      setLoading(false);
      return;
    }
    router.push("/painel");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError message={error} />}
      <Field label="Email" id="email" type="email" placeholder="tu@stand.pt" autoComplete="email" />
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
      <Button type="submit" variant="accent" size="lg" disabled={loading}>
        {loading ? "A entrar…" : "Entrar"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const standName = String(fd.get("stand"));
    setLoading(true);
    setError(null);

    const { error: signUpError } = await signUp.email({
      name: String(fd.get("nome")),
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    if (signUpError) {
      setError(messageFor(signUpError));
      setLoading(false);
      return;
    }

    // Cria o stand como organização (multi-tenant: stand = tenant).
    // TODO(backend): mover para um databaseHook no servidor para ser atómico com o signup.
    const { error: orgError } = await authClient.organization.create({
      name: standName,
      slug: slugify(standName),
    });
    if (orgError) {
      setError("Conta criada, mas falhou criar o stand. Contacta o suporte.");
      setLoading(false);
      return;
    }

    router.push("/painel");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError message={error} />}
      <Field
        label="Nome do stand"
        id="stand"
        placeholder="Stand Costa & Filhos"
        autoComplete="organization"
      />
      <Field label="O teu nome" id="nome" placeholder="Rui Costa" autoComplete="name" />
      <Field label="Email" id="email" type="email" placeholder="tu@stand.pt" autoComplete="email" />
      <Field
        label="Password"
        id="password"
        type="password"
        placeholder="Mínimo 8 caracteres"
        autoComplete="new-password"
      />
      <Button type="submit" variant="accent" size="lg" disabled={loading}>
        {loading ? "A criar conta…" : "Criar conta — 1.º mês grátis"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(fd.get("email")),
      redirectTo: "/recuperar/definir",
    });
    setLoading(false);
    if (error) {
      setError(messageFor(error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-[8px] border border-good/30 bg-good-soft p-3 text-sm text-good">
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Se existir uma conta com esse email, enviámos um link para definir nova password.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError message={error} />}
      <Field label="Email" id="email" type="email" placeholder="tu@stand.pt" autoComplete="email" />
      <Button type="submit" variant="accent" size="lg" disabled={loading}>
        {loading ? "A enviar…" : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
