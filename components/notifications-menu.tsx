"use client";

import { Dropdown } from "@/components/ui/dropdown";
import { relativeDay } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { Bell, BellRing } from "lucide-react";
import Link from "next/link";

/**
 * Sino de notificações: os matches que os alertas do stand dispararam.
 * O ponto âmbar só aparece quando há mesmo alguma coisa — antes disto era
 * um ponto fixo que mentia sempre.
 */
export function NotificationsMenu({ items }: { items: Notification[] }) {
  const has = items.length > 0;

  return (
    <Dropdown
      triggerLabel={has ? `Notificações (${items.length})` : "Notificações"}
      triggerClassName="relative flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
      panelClassName="w-80"
      trigger={
        <>
          {has ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          {has && (
            <span
              aria-hidden
              className="absolute right-2 top-2 size-1.5 rounded-full bg-amber ring-2 ring-paper"
            />
          )}
        </>
      }
    >
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="text-sm font-semibold">Notificações</span>
        <Link href="/alertas" className="text-xs text-ink-soft hover:text-ink">
          Gerir alertas
        </Link>
      </div>
      <div className="h-px bg-line" />

      {has ? (
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={`/anuncio/${n.listingId}`}
                className="flex flex-col gap-0.5 rounded-[6px] px-2.5 py-2 hover:bg-surface-2"
              >
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-ink-soft">
                  Alerta “{n.alertName}” · {relativeDay(n.sentAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-3 py-6 text-center">
          <Bell className="mx-auto size-5 text-ink-soft/50" aria-hidden />
          <p className="mt-2 text-sm font-medium">Não tens notificações</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Cria um alerta e avisamos-te quando aparecer um carro que encaixe.
          </p>
          <Link
            href="/alertas"
            className="mt-3 inline-block text-xs font-semibold text-amber hover:underline"
          >
            Criar alerta
          </Link>
        </div>
      )}
    </Dropdown>
  );
}
