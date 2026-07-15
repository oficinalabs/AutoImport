"use client";

import { PasswordRequirements } from "@/components/password-requirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { checkPassword } from "@/lib/password";
import { Check, Mail, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

/**
 * Erro do Better Auth → mensagem para a pessoa.
 * Lista fechada: nunca deixamos passar texto do servidor que não seja nosso
 * (pode trazer detalhes internos — ver CLAUDE.md).
 */
function mensagemDeErro(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "INVALID_PASSWORD":
      return "A password atual não está certa.";
    case "WEAK_PASSWORD":
      // Vem do nosso hook em lib/auth.ts e diz que regra falta.
      return error.message ?? "A password não cumpre os requisitos.";
    case "TOO_MANY_REQUESTS":
      return "Demasiadas tentativas. Espera um bocado e tenta outra vez.";
    default:
      return "Não foi possível concluir. Tenta outra vez.";
  }
}

/**
 * A conta do próprio: nome, email e password.
 * Separado do StandForm porque são coisas diferentes — o stand é a empresa,
 * isto é a pessoa. E cada um vai a um sítio diferente do Better Auth.
 */
export function AccountForm({ nome, email }: { nome: string; email: string }) {
  return (
    <div className="flex flex-col gap-6">
      <NomeSeccao nomeInicial={nome} />
      <div className="h-px bg-line" />
      <EmailSeccao emailAtual={email} />
      <div className="h-px bg-line" />
      <PasswordSeccao />
    </div>
  );
}

function NomeSeccao({ nomeInicial }: { nomeInicial: string }) {
  const router = useRouter();
  const [editar, setEditar] = useState(false);
  const [nome, setNome] = useState(nomeInicial);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [saving, setSaving] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const limpo = nome.trim();
    if (limpo.length < 2) {
      setAviso({ tipo: "erro", texto: "O nome é obrigatório." });
      return;
    }

    setSaving(true);
    setAviso(null);
    const { error } = await authClient.updateUser({ name: limpo });
    setSaving(false);

    if (error) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
      return;
    }
    setEditar(false);
    router.refresh();
  }

  if (!editar) {
    return (
      <Linha
        titulo="O teu nome"
        valor={nomeInicial}
        onEditar={() => {
          setNome(nomeInicial);
          setEditar(true);
        }}
      />
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2">
      <label htmlFor="user-name" className="text-xs text-ink-soft">
        O teu nome
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="user-name"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            setAviso(null);
          }}
          maxLength={80}
          required
          autoFocus
        />
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditar(false)}
            disabled={saving}
          >
            <X className="size-3.5" />
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            <Check className="size-3.5" />
            Guardar
          </Button>
        </div>
      </div>
      <Mensagem aviso={aviso} />
    </form>
  );
}

function EmailSeccao({ emailAtual }: { emailAtual: string }) {
  const [editar, setEditar] = useState(false);
  const [novo, setNovo] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);
  const [saving, setSaving] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const limpo = novo.trim().toLowerCase();
    if (limpo === emailAtual.toLowerCase()) {
      setAviso({ tipo: "erro", texto: "Esse já é o teu email." });
      return;
    }

    setSaving(true);
    setAviso(null);
    const { error } = await authClient.changeEmail({
      newEmail: limpo,
      callbackURL: "/stand",
    });
    setSaving(false);

    if (error) {
      setAviso({
        tipo: "erro",
        texto:
          error.code === "COULDNT_UPDATE_YOUR_EMAIL"
            ? "Esse email já está a ser usado."
            : mensagemDeErro(error),
      });
      return;
    }
    setEditar(false);
    setNovo("");
    setAviso({
      tipo: "ok",
      texto: `Enviámos um email para ${limpo}. Até confirmares, a conta continua com o email atual.`,
    });
  }

  if (!editar) {
    return (
      <div className="flex flex-col gap-2">
        <Linha titulo="Email" valor={emailAtual} onEditar={() => setEditar(true)} />
        <Mensagem aviso={aviso} />
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2">
      <label htmlFor="user-email" className="text-xs text-ink-soft">
        Novo email
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="user-email"
          type="email"
          value={novo}
          onChange={(e) => {
            setNovo(e.target.value);
            setAviso(null);
          }}
          placeholder={emailAtual}
          required
          autoFocus
        />
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditar(false)}
            disabled={saving}
          >
            <X className="size-3.5" />
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            <Mail className="size-3.5" />
            Enviar confirmação
          </Button>
        </div>
      </div>
      <p className="text-xs text-ink-soft">
        Mandamos um link para o endereço novo. A conta só muda depois de o confirmares.
      </p>
      <Mensagem aviso={aviso} />
    </form>
  );
}

function PasswordSeccao() {
  const [editar, setEditar] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [terminarOutras, setTerminarOutras] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [saving, setSaving] = useState(false);

  const novaOk = checkPassword(nova).valid;

  function fechar() {
    setEditar(false);
    setAtual("");
    setNova("");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAviso(null);
    const { error } = await authClient.changePassword({
      currentPassword: atual,
      newPassword: nova,
      revokeOtherSessions: terminarOutras,
    });
    setSaving(false);

    if (error) {
      // Distinguir pelo CÓDIGO, não pelo status: um 400 tanto pode ser a
      // password atual errada como a nova ser fraca — dizer "a password atual
      // não está certa" quando não é isso manda a pessoa procurar o problema
      // no sítio errado. Só mostramos mensagens que nós controlamos.
      setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
      return;
    }
    fechar();
    setAviso({ tipo: "ok", texto: "Password alterada." });
  }

  if (!editar) {
    return (
      <div className="flex flex-col gap-2">
        <Linha
          titulo="Password"
          valor="••••••••••"
          onEditar={() => setEditar(true)}
          rotulo="Mudar"
        />
        <Mensagem aviso={aviso} />
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3">
      <p className="text-sm font-medium">Mudar password</p>

      <div>
        <label htmlFor="pw-atual" className="mb-1 block text-xs text-ink-soft">
          Password atual
        </label>
        <Input
          id="pw-atual"
          type="password"
          value={atual}
          onChange={(e) => {
            setAtual(e.target.value);
            setAviso(null);
          }}
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="pw-nova" className="mb-1 block text-xs text-ink-soft">
          Nova password
        </label>
        <Input
          id="pw-nova"
          type="password"
          value={nova}
          onChange={(e) => {
            setNova(e.target.value);
            setAviso(null);
          }}
          autoComplete="new-password"
          required
        />
        {nova.length > 0 && (
          <div className="mt-2">
            <PasswordRequirements password={nova} />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={terminarOutras}
          onChange={(e) => setTerminarOutras(e.target.checked)}
          className="size-4 accent-petrol"
        />
        Terminar sessão nos outros dispositivos
      </label>

      <div className="flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={fechar} disabled={saving}>
          <X className="size-3.5" />
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!novaOk || !atual}
        >
          <Check className="size-3.5" />
          Mudar password
        </Button>
      </div>
      <Mensagem aviso={aviso} />
    </form>
  );
}

function Linha({
  titulo,
  valor,
  onEditar,
  rotulo = "Editar",
}: {
  titulo: string;
  valor: string;
  onEditar: () => void;
  rotulo?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-ink-soft">{titulo}</p>
        <p className="truncate font-medium">{valor}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onEditar}>
        <Pencil className="size-3.5" />
        {rotulo}
      </Button>
    </div>
  );
}

function Mensagem({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p
      role="alert"
      className={`rounded-[6px] px-3 py-2 text-sm ${
        aviso.tipo === "ok" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
      }`}
    >
      {aviso.texto}
    </p>
  );
}
