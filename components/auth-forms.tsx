"use client";

import { PasswordRequirements } from "@/components/password-requirements";
import { Button } from "@/components/ui/button";
import { authClient, signIn, signUp } from "@/lib/auth-client";
import { checkPassword } from "@/lib/password";
import { CircleAlert, CircleCheck, MailCheck, MailWarning } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Mensagem de erro em PT a partir do erro do Better Auth. */
function messageFor(
  error: { code?: string; message?: string; status?: number } | null | undefined,
): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email ou password incorretos.";
    case "USER_ALREADY_EXISTS":
      return "Já existe uma conta com este email.";
    case "PASSWORD_TOO_SHORT":
    case "WEAK_PASSWORD":
      return error?.message ?? "A password não cumpre os requisitos de segurança.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirma o teu email antes de entrares.";
    default:
      // 429 = rate limit do Better Auth.
      if (error?.status === 429) {
        return "Demasiadas tentativas. Aguarda um minuto e tenta outra vez.";
      }
      return error?.message ?? "Ocorreu um erro. Tenta novamente.";
  }
}

function Field({
  label,
  id,
  type = "text",
  placeholder,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  /** Opcional: torna o campo controlado (ex.: para o checklist da password). */
  value?: string;
  onChange?: (value: string) => void;
}) {
  const controlled = value !== undefined && onChange !== undefined;
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
        {...(controlled ? { value, onChange: (e) => onChange(e.target.value) } : {})}
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

export function SignInForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    setLoading(true);
    setError(null);
    setUnverified(null);

    const { error } = await signIn.email({ email, password: String(fd.get("password")) });
    if (error) {
      // Conta por verificar: oferecemos reenviar em vez de um erro seco.
      if (error.status === 403 || error.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(email);
      } else {
        setError(messageFor(error));
      }
      setLoading(false);
      return;
    }
    router.push("/painel");
    router.refresh();
  }

  if (unverified) {
    return <ResendVerification email={unverified} onBack={() => setUnverified(null)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled && (
        <>
          <GoogleButton label="Entrar com Google" />
          <Separator />
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <FormError message={error} />}
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
        <Button type="submit" variant="accent" size="lg" disabled={loading}>
          {loading ? "A entrar…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}

export function SignUpForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const passwordOk = checkPassword(password).valid;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    setLoading(true);
    setError(null);

    // O stand é criado no servidor (databaseHook), a partir de standName.
    const { error: signUpError } = await signUp.email({
      name: String(fd.get("nome")),
      email,
      password: String(fd.get("password")),
      standName: String(fd.get("stand")),
    } as Parameters<typeof signUp.email>[0]);

    setLoading(false);
    if (signUpError) {
      setError(messageFor(signUpError));
      return;
    }
    // Com verificação de email obrigatória, não há sessão: pedimos confirmação.
    setSentTo(email);
  }

  if (sentTo) {
    return <CheckInbox email={sentTo} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled && (
        <>
          <GoogleButton label="Continuar com Google" />
          <Separator />
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <FormError message={error} />}
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
        <div className="flex flex-col gap-2">
          <Field
            label="Password"
            id="password"
            type="password"
            placeholder="Escolhe uma password forte"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
          <PasswordRequirements password={password} />
        </div>
        <Button type="submit" variant="accent" size="lg" disabled={loading || !passwordOk}>
          {loading ? "A criar conta…" : "Criar conta — 1.º mês grátis"}
        </Button>
      </form>
    </div>
  );
}

/** Ecrã pós-registo: confirmar o email. */
function CheckInbox({ email }: { email: string }) {
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    await authClient.sendVerificationEmail({ email, callbackURL: "/painel" });
    setSending(false);
    setResent(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-[8px] border border-good/30 bg-good-soft p-3 text-sm text-good">
        <MailCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Conta criada. Enviámos um email para <strong>{email}</strong> — confirma-o para ativar a
          conta.
        </span>
      </div>
      <p className="text-sm text-ink-soft">
        Não chegou? Vê a pasta de spam ou{" "}
        <button
          type="button"
          onClick={resend}
          disabled={sending || resent}
          className="font-medium text-petrol-ink underline disabled:no-underline disabled:opacity-60"
        >
          {resent ? "email reenviado" : sending ? "a reenviar…" : "reenviar email"}
        </button>
        .
      </p>
      <Link href="/entrar" className="text-center text-sm text-petrol-ink hover:underline">
        ← Voltar a entrar
      </Link>
    </div>
  );
}

/** Login bloqueado por email não verificado. */
function ResendVerification({ email, onBack }: { email: string; onBack: () => void }) {
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    await authClient.sendVerificationEmail({ email, callbackURL: "/painel" });
    setSending(false);
    setResent(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-[8px] border border-warn/30 bg-amber/10 p-3 text-sm">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-warn" />
        <span className="text-ink">
          Falta confirmar o email. Enviámos um link para <strong>{email}</strong> quando criaste a
          conta.
        </span>
      </div>
      <Button variant="accent" size="lg" onClick={resend} disabled={sending || resent}>
        {resent ? "Email reenviado" : sending ? "A reenviar…" : "Reenviar email de confirmação"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="text-center text-sm text-petrol-ink hover:underline"
      >
        ← Voltar
      </button>
    </div>
  );
}

function GoogleButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        signIn.social({ provider: "google", callbackURL: "/painel" });
      }}
    >
      <GoogleIcon />
      {loading ? "A abrir o Google…" : label}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
      />
    </svg>
  );
}

function Separator() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-soft">ou com email</span>
      <span className="h-px flex-1 bg-line" />
    </div>
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

/** Define a nova password a partir do token do email. */
export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <FormError message="Este link é inválido ou já foi usado." />
        <Button asChild variant="outline" size="lg">
          <Link href="/recuperar">Pedir um novo link</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const confirm = String(fd.get("confirm"));

    const check = checkPassword(password);
    if (!check.valid) {
      setError(check.message ?? "A password não cumpre os requisitos.");
      return;
    }
    if (password !== confirm) {
      setError("As passwords não coincidem.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);

    if (error) {
      setError(
        error.code === "INVALID_TOKEN" || error.status === 400
          ? "Este link expirou ou já foi usado. Pede um novo."
          : messageFor(error),
      );
      return;
    }
    router.push("/entrar?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError message={error} />}
      <div className="flex flex-col gap-2">
        <Field
          label="Nova password"
          id="password"
          type="password"
          placeholder="Escolhe uma password forte"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
        <PasswordRequirements password={password} />
      </div>
      <Field
        label="Confirmar password"
        id="confirm"
        type="password"
        placeholder="Repete a password"
        autoComplete="new-password"
      />
      <Button type="submit" variant="accent" size="lg" disabled={loading}>
        {loading ? "A guardar…" : "Guardar nova password"}
      </Button>
    </form>
  );
}
