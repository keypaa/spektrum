"use client";

import { cn } from "../lib/cn";

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

// No Radix switch in this app: the 36×20 pill is a <button role="switch">
// whose checked styling hangs off `aria-checked:` variants (the bundle's
// `ky.Switch` is styled the same way). Tokens: switch-bg-on/off,
// switch-handle-on/off, switch-border-off.
export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // `group` so the thumb (a child) can react to this element's
        // aria-checked: `aria-checked:` alone only matches an element that
        // carries the attribute itself, which is why the thumb never moved.
        "group relative h-5 w-9 flex-none rounded-full border border-[color:var(--switch-border-off)] bg-switch-bg-off transition-colors",
        "aria-checked:bg-switch-bg-on aria-checked:border-switch-bg-on",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          // top-1/2 + -translate-y-1/2 centres the 16px thumb in the 18px
          // padding box (the track has a 1px border). 2px left/right margins
          // keep the thumb centred when checked at left-[16px].
          "absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-switch-handle-off transition-[left,background-color]",
          "group-aria-checked:left-[16px] group-aria-checked:bg-switch-handle-on",
        )}
      />
    </button>
  );
}