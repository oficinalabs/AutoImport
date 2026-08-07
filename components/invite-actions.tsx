"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { acceptInvite } from "@/lib/data";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Aceitar o convite com a sessão atual. O servidor volta a validar tudo. */
export function AcceptInvite({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setLoading(true);
    setError(null);
    const result = await acceptInvite(id);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push("/painel");
    router.refresh();
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      {error && (
        <div className="flex items-start gap-2 rounded-[8px] border border-bad/30 bg-bad-soft p-3 text-sm text-bad">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button variant="accent" size="lg" onClick={handleAccept} loading={loading}>
        {loading ? "A entrar na equipa…" : "Aceitar convite"}
      </Button>
    </div>
  );
}

/**
 * Sessão iniciada com o email errado: sair e voltar aqui. Sem isto, quem tem o
 * link e outra conta aberta fica encurralado — o convite é dele, a sessão é que
 * não.
 */
export function SwitchAccount({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="lg"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await signOut();
        router.push(`/entrar?next=${encodeURIComponent(`/convite/${id}`)}`);
        router.refresh();
      }}
    >
      Sair da sessão e entrar com o email do convite
    </Button>
  );
}
