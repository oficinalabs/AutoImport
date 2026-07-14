"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth-client";
import { COUNTRY_LIST } from "@/lib/countries";
import { cn } from "@/lib/utils";
import {
  Bell,
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

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/painel" className="mr-2 flex items-center gap-2 font-display font-bold">
          <span className="flex size-7 items-center justify-center rounded-[6px] bg-petrol text-amber">
            <Car className="size-4" />
          </span>
          <span className="hidden sm:inline">AutoImport</span>
        </Link>

        {/* Nav */}
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden md:inline">{label}</span>
                {active && (
                  <span className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-amber" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Direita */}
        <div className="flex items-center gap-1.5">
          <CountryMenu />
          <ThemeToggle />
          <Link
            href="/pesquisar"
            aria-label="Notificações"
            className="relative flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <Bell className="size-4" />
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-amber" />
          </Link>
          <AvatarMenu />
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

function AvatarMenu() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/entrar");
    router.refresh();
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
        <span className="flex size-8 items-center justify-center rounded-full bg-steel/20 text-sm font-semibold text-steel">
          RC
        </span>
        <ChevronDown className="size-3.5 text-ink-soft" />
      </summary>
      <div className="absolute right-0 mt-1 w-52 rounded-[8px] border border-line bg-surface p-1 shadow-lg">
        <div className="px-2.5 py-2">
          <div className="text-sm font-semibold">Stand Costa &amp; Filhos</div>
          <div className="text-xs text-ink-soft">Trial · termina 9 ago</div>
        </div>
        <div className="my-1 h-px bg-line" />
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
