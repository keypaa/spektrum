import type { SVGProps } from "react";

// Spektrum icon registry — spec §5.8.
// One component per icon. 16×16 grid, fill="none", stroke="currentColor",
// strokeWidth 1.5, round caps/joins. No emoji, no icon fonts, no third-party
// package. Each later phase adds exactly the icons it needs.

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | undefined };

function base({ size = 16, className, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
    ...rest,
  };
}

export function IconSearch({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

export function IconWarning({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <title>Warning</title>
      <path d="M8 1.5 14.5 13H1.5Z" />
      <path d="M8 6.5v3.5M8 11.5v.5" />
    </svg>
  );
}

export function IconError({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <title>Error</title>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v4M8 11v.5" />
    </svg>
  );
}

export function IconInfo({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <title>Info</title>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v.5M8 6.5v5M8 11.5v.5" />
    </svg>
  );
}

export function IconCheck({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3 8.5 6.5 12 13 4" />
    </svg>
  );
}

export function IconClose({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
    </svg>
  );
}

export function IconChevronDown({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3 6 8 11 13 6" />
    </svg>
  );
}

export function IconChevronRight({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6 3 11 8 6 13" />
    </svg>
  );
}

export function IconBrand({ size, className, ...rest }: IconProps) {
  // Solid brand mark — spec §5.8: solid marks use fill="currentColor" and NO
  // stroke. Distinct from every stroked icon in the registry.
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d="M8 1.2c.75-1.05 2.15-1.4 3.1-.65.95.75 1.3 2.05 1.05 3-.95.2-1.8.85-2.25 1.7-.55.95-.35 2.15.45 2.9-1.05.2-1.85 1-2.1 1.95-.2.95.2 2 .95 2.65-.75.55-1.85.65-2.6.2-.4.95-1.3 1.6-2.25 1.7-.95.1-1.9-.35-2.55-1.1-.75.65-1.8.75-2.7.25-.95-.55-1.5-1.6-1.4-2.6-.85-.2-1.6-.85-2.05-1.7-.45-.85-.3-2 .45-2.9-1-.3-1.75-1.05-2-2-.2-.95.2-2 .95-2.65.75-.55 1.85-.65 2.6-.2.4-.95 1.3-1.6 2.25-1.7.95-.1 1.9.35 2.55 1.1z" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}