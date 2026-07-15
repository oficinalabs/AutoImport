"use client";

import { NavLink } from "@/components/nav-link";
import { NotificationsMenu } from "@/components/notifications-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth-client";
import { COUNTRY_LIST } from "@/lib/countries";
import type { Notification } from "@/lib/types";
import {
  BellRing,
  Car,
  ChevronDown,
  Heart,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Search,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/pesquisar", label: "Pesquisar", icon: Search },
  { href: "/favoritos", label: "Favoritos", icon: Heart },
  { href: "/negociacoes", label: "Negociações", icon: MessagesSquare },
  { href: "/compras", label: "Compras", icon: Car },
];

function isActive(pathname: string, href: string) {
  return pathname.startsWith(href);
}

export interface TopBarProps {
  standName: string;
  userName: string;
  /** rótulo da subscrição, ex.: "Trial · termina 9 ago" */
  subscriptionLabel: string;
  notifications: Notification[];
}

export function TopBar({ standName, userName, subscriptionLabel, notifications }: TopBarProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/painel"
          className="mr-1 flex shrink-0 items-center gap-2 font-display font-bold sm:mr-2"
        >
          <span className="flex size-7 items-center justify-center rounded-[6px] bg-petrol text-amber">
            <Car className="size-4" />
          </span>
          <span className="hidden sm:inline">AutoImport</span>
        </Link>

        {/* Nav — sem overflow-x-auto: em ecrãs estreitos o NavLink já esconde
            os rótulos e ficam só os ícones, que cabem sempre. Uma barra de
            scroll na top bar é sempre um bug, não uma solução. */}
        <nav className="flex min-w-0 flex-1 items-center gap-0.5">
          {NAV.map(({ href, label, icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(pathname, href)}
            />
          ))}
        </nav>

        {/* Direita. O seletor de tema ocupa 94px — em ecrãs estreitos isso é
            mais do que sobra para a navegação, por isso passa para dentro do
            menu da conta. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <CountryMenu />
          <ThemeToggle className="hidden sm:flex" />
          <NotificationsMenu items={notifications} />
          <AvatarMenu
            standName={standName}
            userName={userName}
            subscriptionLabel={subscriptionLabel}
          />
        </div>
      </div>
    </header>
  );
}

function CountryMenu() {
  return (
    <details className="group relative hidden sm:block">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-full border border-line px-2.5 text-sm text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden>🌍</span>
        <span className="hidden lg:inline">Países</span>
        <ChevronDown className="size-3.5" />
      </summary>
      <div className="absolute right-0 mt-1 w-44 rounded-[8px] border border-line bg-surface p-1 shadow-lg">
        {COUNTRY_LIST.map((c) => (
          <Link
            key={c.code}
            href={`/pesquisar?pais=${c.code}`}
            className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm hover:bg-surface-2"
          >
            <span aria-hidden>{c.flag}</span>
            {c.name}
          </Link>
        ))}
      </div>
    </details>
  );
}

const AVATAR_MENU = [
  { href: "/alertas", label: "Alertas", icon: BellRing },
  { href: "/stand", label: "Stand / Perfil", icon: Store },
];

/** Iniciais do nome, para o avatar. "Rui Costa" → "RC". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function AvatarMenu({
  standName,
  userName,
  subscriptionLabel,
}: {
  standName: string;
  userName: string;
  subscriptionLabel: string;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/entrar");
    router.refresh();
  }

  return (
    <details className="group relative">
      <summary
        aria-label={`Conta de ${userName}`}
        className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-steel/20 text-sm font-semibold text-steel">
          {initials(userName)}
        </span>
        <ChevronDown className="size-3.5 text-ink-soft" />
      </summary>
      <div className="absolute right-0 mt-1 w-56 rounded-[8px] border border-line bg-surface p-1 shadow-lg">
        <div className="px-2.5 py-2">
          <div className="truncate text-sm font-semibold" title={standName}>
            {standName}
          </div>
          <div className="text-xs text-ink-soft">{subscriptionLabel}</div>
        </div>
        <div className="my-1 h-px bg-line" />
        {/* Em ecrãs estreitos o tema não cabe na barra — vive aqui. */}
        <div className="flex items-center justify-between px-2.5 py-1.5 sm:hidden">
          <span className="text-sm text-ink-soft">Tema</span>
          <ThemeToggle />
        </div>
        <div className="my-1 h-px bg-line sm:hidden" />
        {AVATAR_MENU.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm hover:bg-surface-2"
          >
            <Icon className="size-4 text-ink-soft" />
            {label}
          </Link>
        ))}
        <div className="my-1 h-px bg-line" />
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="size-4" />
          Terminar sessão
        </button>
      </div>
    </details>
  );
}
