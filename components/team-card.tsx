"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cancelInvite, inviteMember } from "@/lib/data";
import type { Member, PendingInvite } from "@/lib/types";
import { Clock, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * A equipa do stand: quem já lá está, quem foi convidado e ainda não entrou.
 *
 * Só o dono convida (e cancela) — o botão nem aparece aos outros. Quem manda é
 * o servidor: `inviteMember`/`cancelInvite` revalidam o papel antes de fazerem
 * seja o que for (lib/invites.ts), isto aqui é só conveniência.
 */
export function TeamCard({
  members,
  invites,
  isOwner,
}: {
  members: Member[];
  invites: PendingInvite[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const result = await inviteMember(email);
    setSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo(email.trim());
    setEmail("");
    setInviting(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Equipa</CardTitle>
        {isOwner && !inviting && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setInviting(true);
              setSentTo(null);
            }}
          >
            Convidar
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {isOwner && inviting && (
          <form
            onSubmit={handleInvite}
            className="flex flex-col gap-2 rounded-[8px] bg-surface-2 p-3"
          >
            <label htmlFor="convite-email" className="text-xs text-ink-soft">
              Email de quem trabalha contigo. Entra como colaborador — o preço do stand não muda.
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="convite-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="colega@stand.pt"
                autoComplete="off"
                required
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button type="submit" variant="primary" size="md" loading={sending}>
                  Enviar convite
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={sending}
                  onClick={() => {
                    setInviting(false);
                    setError(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-[6px] bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
          </form>
        )}

        {sentTo && (
          <p className="rounded-[6px] bg-good-soft px-3 py-2 text-sm text-good">
            Convite enviado para {sentTo}. Fica aqui em baixo até ser aceite.
          </p>
        )}

        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-[8px] border border-line p-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-steel/20 text-sm font-semibold text-steel">
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.name}</div>
              <div className="flex items-center gap-1 text-xs text-ink-soft">
                <Mail className="size-3" />
                {m.email}
              </div>
            </div>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-soft">
              {m.role === "owner" ? "Dono" : "Colaborador"}
            </span>
          </div>
        ))}

        {invites.map((i) => (
          <PendingRow key={i.id} invite={i} canCancel={isOwner} onDone={() => router.refresh()} />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingRow({
  invite,
  canCancel,
  onDone,
}: {
  invite: PendingInvite;
  canCancel: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setBusy(true);
    setError(null);
    const result = await cancelInvite(invite.id);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <div className="flex flex-col gap-1 rounded-[8px] border border-dashed border-line p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
          <Clock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{invite.email}</div>
          <div className="text-xs text-ink-soft">Convite enviado — ainda não aceite</div>
        </div>
        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            loading={busy}
            title="Cancelar convite"
          >
            <X className="size-3.5" />
            Cancelar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
