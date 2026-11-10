import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

// No "destructive" variant in Phase 1: the row-menu Delete is NOT red (D24),
// so nothing uses it. Re-add when a genuinely destructive action exists.
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-button-primary-bg text-button-primary-text hover:bg-button-primary-bg-hover hover:text-button-primary-text-hover",
  secondary:
    "bg-button-secondary-bg text-button-secondary-text hover:bg-button-secondary-bg-hover border border-[color:var(--border-outline)]",
  ghost:
    "bg-transparent text-button-tertiary-text hover:bg-button-tertiary-bg-hover hover:text-button-tertiary-text-hover",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  // The header's Import and New buttons measure 41 physical = 36 CSS tall
  // (h-9) and 113/123 physical = 100/109 CSS wide, i.e. natural width from
  // px-4 + gap-2 + a 16 px icon. No fixed widths.
  md: "h-9 px-4 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full font-normal",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-button-primary-bg",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});
