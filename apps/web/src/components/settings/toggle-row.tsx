"use client";

import { cn } from "@spektrum/ui";
import { Toggle } from "@spektrum/ui";

export interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}

/** Label/description on the left, switch on the right (bundle `k$`/`kz`/`kF`/`kq`). */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: ToggleRowProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-6 py-4",
      )}
    >
      <div className="flex grow flex-col gap-1">
        <div className="text-base font-normal text-text-editor-primary">{label}</div>
        {description ? (
          <div className="text-sm text-text-editor-secondary">{description}</div>
        ) : null}
      </div>
      <Toggle
        checked={checked}
        onCheckedChange={onChange}
        label={label}
        {...(disabled === undefined ? {} : { disabled })}
      />
    </div>
  );
}