"use client";

import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Claro" },
  { value: "system", icon: Monitor, label: "Sistema" },
  { value: "dark", icon: Moon, label: "Escuro" },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className={cn("h-8 w-[92px] rounded-full border border-line", className)} aria-hidden />
    );
  }

  return (
    <fieldset
      className={cn(
        "flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5",
        className,
      )}
      aria-label="Tema"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-pressed={theme === value}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            theme === value ? "bg-petrol text-white" : "text-ink-soft hover:text-ink",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </fieldset>
  );
}
