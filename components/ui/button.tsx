import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-sm font-semibold transition-[filter,background-color,border-color] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // CTA principal — âmbar. Ver docs/01-DESIGN.md.
        accent: "bg-amber text-[#241500] hover:brightness-[1.06]",
        primary: "bg-petrol text-white hover:brightness-125",
        outline: "border border-line-strong bg-transparent text-ink hover:bg-surface-2",
        ghost: "bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink",
        subtle: "bg-surface-2 text-ink hover:bg-neutral-soft",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Mostra spinner e bloqueia o botão. O texto mantém-se (não salta o
   * layout) e o leitor de ecrã é avisado que está a processar.
   */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    // Com asChild o filho é outro elemento (ex.: Link) — não injetamos spinner.
    if (asChild) {
      return (
        <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
