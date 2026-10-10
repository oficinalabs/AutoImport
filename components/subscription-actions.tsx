"use client";

import { Button } from "@/components/ui/button";
import type { SubscriptionStatus } from "@/lib/types";
import { useEffect, useState } from "react";

/**
 * O botão da subscrição em /stand: "Subscrever" (checkout da Polar) enquanto
 * não há subscrição a correr, "Gerir subscrição" (portal da Polar) depois.
 *
 * Só o dono vê os botões — e as rotas voltam a verificar (lib/billing-auth.ts).
 * Sem a Polar configurada fica o botão desativado de antes: um botão que dá
 * erro é pior do que um que diz que ainda não dá.
 */
export function SubscriptionActions({
  status,
  isOwner,
  configured,
}: {
  status: SubscriptionStatus;
  isOwner: boolean;
  configured: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voltouDoCheckout, setVoltouDoCheckout] = useState(false);

  // A Polar devolve a /stand?checkout=ok. O webhook pode chegar uns segundos
  // depois do browser — sem este aviso o stand via "Trial" e achava que falhou.
  useEffect(() => {
    setVoltouDoCheckout(new URLSearchParams(window.location.search).get("checkout") === "ok");
  }, []);

  if (!isOwner) {
    return <p className="text-sm text-ink-soft">Só o dono do stand gere a subscrição.</p>;
  }

  if (!configured) {
    return (
      <Button variant="primary" disabled title="Ainda não disponível">
        Gerir subscrição
      </Button>
    );
  }

  const subscrever = status === "trial" || status === "expirada";

  async function abrir() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(subscrever ? "/api/polar/checkout" : "/api/polar/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !body.url) throw new Error();
      window.location.assign(body.url);
    } catch {
      setError(
        subscrever
          ? "Não foi possível abrir o pagamento. Tenta outra vez daqui a pouco."
          : "Não foi possível abrir a gestão da subscrição. Tenta outra vez daqui a pouco.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {voltouDoCheckout && subscrever && (
        <p className="text-sm text-good">
          Pagamento recebido. A subscrição fica ativa assim que a Polar o confirmar — atualiza a
          página dentro de um minuto.
        </p>
      )}
      <Button variant={subscrever ? "accent" : "primary"} loading={loading} onClick={abrir}>
        {subscrever ? "Subscrever" : "Gerir subscrição"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
