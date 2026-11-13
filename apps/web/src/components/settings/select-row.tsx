"use client";

import { IconChevronDown } from "@spektrum/ui/icons";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectRowProps {
  label: string;
  description?: string;
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
  disabled?: boolean;
}

/** Label/description on the left, a 160 px native select on the right. */
export function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: SelectRowProps) {
  return (
    <div className="flex w-full items-center justify-between gap-6 py-4">
      <div className="flex grow flex-col gap-1">
        <div className="text-base font-normal text-text-editor-primary">{label}</div>
        {description ? (
          <div className="text-sm text-text-editor-secondary">{description}</div>
        ) : null}
      </div>
      <div className="relative w-40 flex-none">
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full appearance-none rounded-lg border border-[color:var(--border-outline)] bg-bg-app pl-2 pr-7 text-sm text-text-editor-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronDown
          size={14}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-editor-tertiary"
        />
      </div>
    </div>
  );
}