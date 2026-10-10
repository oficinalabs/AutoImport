"use client";

import { Button } from "@/components/ui/button";
import type { SellerMessage as Message } from "@/lib/country-guides";
import { fillSellerMessage } from "@/lib/country-guides";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Mensagem pronta ao vendedor, na língua do país (na Bélgica em francês e em
 * neerlandês), já com o carro, o preço e o link. O stand só põe o n.º de IVA e a
 * assinatura. Textos em lib/country-guides.ts.
 */
export function SellerMessage({
  messages,
  car,
  price,
  link,
}: {
  messages: Message[];
  car: string;
  price: string;
  link?: string;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const msg = messages[active] ?? messages[0];
  const text = fillSellerMessage(msg.template, { car, price, link });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de clipboard (http, browser antigo): o texto está à vista
      // e dá para selecionar à mão.
    }
  }

  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Mensagem ao vendedor
        </h2>
        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <div className="flex rounded-[6px] border border-line p-0.5">
              {messages.map((m, i) => (
                <button
                  key={m.lang}
                  type="button"
                  aria-pressed={i === active}
                  onClick={() => {
                    setActive(i);
                    setCopied(false);
                  }}
                  className={cn(
                    "rounded-[4px] px-2 py-1 text-xs font-medium",
                    i === active ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copiada" : "Copiar"}
          </Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-ink-soft">
        {messages.length > 1 ? "" : `Em ${msg.label.toLowerCase()}. `}Pergunta o regime de IVA, o
        preço a pronto e os documentos. Substitui o n.º de IVA e a assinatura.
      </p>
      <pre
        lang={msg.lang}
        className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-[8px] bg-surface-2 p-3 font-sans text-xs leading-relaxed"
      >
        {text}
      </pre>
    </div>
  );
}
