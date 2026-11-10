import * as R from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export const DropdownMenu = R.Root;
export const DropdownMenuTrigger = R.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 9,
  align = "end",
  children,
  ...rest
}: R.DropdownMenuContentProps & { children: ReactNode }) {
  return (
    <R.Portal>
      {/* Bundle module 845912: the surface is `bg-optionmenu-bg p-1 rounded-2xl
          shadow-[var(--shadow-menu)]` (→ our `shadow-menu`) inside the Radix
          content (`z-[2100]`, no border — the capture's menu edge is shadow
          only, fill #353535 = --optionmenu-bg dark). */}
      <R.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-[200px] overflow-clip rounded-2xl bg-optionmenu-bg p-1 shadow-menu",
          "focus:outline-none",
          className,
        )}
        {...rest}
      >
        {children}
      </R.Content>
    </R.Portal>
  );
}

export function DropdownMenuItem({
  className,
  children,
  ...rest
}: R.DropdownMenuItemProps & { children: ReactNode }) {
  return (
    // Bundle `optionMenuItemClassName`: h-10, rounded-xl, text-sm font-medium
    // leading-5, text-optionmenu-text-primary, hover + data-highlighted bg.
    <R.Item
      className={cn(
        "flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-xl px-3 text-sm font-medium leading-5 text-optionmenu-text-primary outline-none",
        "hover:bg-optionmenu-bg-hover hover:text-optionmenu-text-primary-hover",
        "data-[highlighted]:bg-optionmenu-bg-hover data-[highlighted]:text-optionmenu-text-primary-hover",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </R.Item>
  );
}

export function DropdownMenuSeparator({
  className,
  ...rest
}: R.DropdownMenuSeparatorProps) {
  return (
    <R.Separator
      className={cn("my-1 h-px bg-optionmenu-border", className)}
      {...rest}
    />
  );
}
