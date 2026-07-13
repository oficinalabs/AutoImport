import { cn } from "@/lib/utils";
import * as React from "react";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-10 w-full rounded-[6px] border border-line-strong bg-surface px-3 text-sm text-ink",
        "placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
