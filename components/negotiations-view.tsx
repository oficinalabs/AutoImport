"use client";

import { Lock, Send } from "lucide-react";
import { useState } from "react";
import { CarImage } from "@/components/car-image";
import { CountryFlag } from "@/components/country-flag";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/lib/data";
import { formatEuro, relativeDay } from "@/lib/format";
import type { Conversation, ConversationStatus, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<ConversationStatus, { label: string; className: string }> = {
  aguarda_resposta: { label: "Aguarda resposta", className: "bg-neutral-soft text-steel" },
  respondido: { label: "Respondido", className: "bg-good-soft text-good" },
  acordo: { label: "Acordo", className: "bg-petrol text-white" },
};

const TEMPLATES = ["Pedir mais fotos", "Confirmar disponibilidade", "Propor preço"];

export function NegotiationsView({ conversations }: { conversations: Conversation[] }) {
  const [activeId, setActiveId] = useState(conversations[0]?.id);
  const [threads, setThreads] = useState<Record<string, Message[]>>(
    Object.fromEntries(conversations.map((c) => [c.id, c.messages])),
  );
  const [draft, setDraft] = useState("");

  const active = conversations.find((c) => c.id === activeId);

  async function send() {
    if (!draft.trim() || !active) return;
    const msg: Message = {
      id: `local-${Date.now()}`,
      author: "stand",
      body: draft.trim(),
      sentAt: new Date().toISOString(),
    };
    setThreads((t) => ({ ...t, [active.id]: [...(t[active.id] ?? []), msg] }));
    setDraft("");
    await sendMessage(active.id, msg.body); // TODO(backend): email mascarado
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Negociações</h1>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Lista */}
        <div className="flex flex-col gap-2">
          {conversations.map((c) => {
            const st = STATUS[c.status];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex gap-3 rounded-[10px] border p-3 text-left transition-colors",
                  c.id === activeId
                    ? "border-petrol bg-surface"
                    : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <CarImage className="size-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.listingTitle}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                    <CountryFlag code={c.country} showName={false} />
                    <span className="tnum text-good">−{formatEuro(c.savings)}</span>
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                      st.className,
                    )}
                  >
                    {st.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Fio */}
        {active && (
          <div className="flex flex-col rounded-[10px] border border-line bg-surface">
            {/* Cartão do carro */}
            <div className="flex items-center gap-3 border-b border-line p-3">
              <CarImage className="size-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{active.listingTitle}</div>
                <div className="text-xs text-ink-soft">
                  <CountryFlag code={active.country} /> ·{" "}
                  <span className="tnum text-good">poupa {formatEuro(active.savings)}</span>
                </div>
              </div>
              <span className="text-xs text-ink-soft">{active.supplierName}</span>
            </div>

            {/* Aviso de privacidade */}
            <div className="flex items-center gap-2 bg-surface-2 px-3 py-2 text-xs text-ink-soft">
              <Lock className="size-3.5 shrink-0 text-steel" />
              Comunicação por email mascarado da plataforma — o email real do fornecedor
              e do stand fica privado.
            </div>

            {/* Mensagens */}
            <div className="flex flex-1 flex-col gap-3 p-4">
              {(threads[active.id] ?? []).map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-[10px] px-3 py-2 text-sm",
                    m.author === "stand"
                      ? "self-end bg-petrol text-white"
                      : "self-start bg-surface-2",
                  )}
                >
                  <p>{m.body}</p>
                  <div
                    className={cn(
                      "mt-1 text-[11px]",
                      m.author === "stand" ? "text-white/60" : "text-ink-soft",
                    )}
                  >
                    {m.author === "stand" ? "Tu" : "Fornecedor"} · {relativeDay(m.sentAt)}
                  </div>
                </div>
              ))}
            </div>

            {/* Composição */}
            <div className="border-t border-line p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft(t)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:text-ink"
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="Escreve a tua mensagem…"
                  className="flex-1 resize-none rounded-[6px] border border-line-strong bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                />
                <Button variant="accent" onClick={send} disabled={!draft.trim()}>
                  <Send className="size-4" /> Enviar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
