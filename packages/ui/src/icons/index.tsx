import type { SVGProps } from "react";

// Spektrum icon registry — spec §5.8.
// One component per icon. 16×16 grid, fill="none", stroke="currentColor",
// strokeWidth 1.5, round caps/joins. No emoji, no icon fonts, no third-party
// package. Each later phase adds exactly the icons it needs.

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

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
      <path d="M8 1.5 14.5 13H1.5Z" />
      <path d="M8 6.5v3.5M8 11.5v.5" />
    </svg>
  );
}

export function IconError({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v4M8 11v.5" />
    </svg>
  );
}

export function IconInfo({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
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
  // Prism brand mark — six concentric petals, white strokes on a dark card.
  // Not the OpenAI logo. Spec §10.8.
  return (
    <svg
      {...base({ size, className, ...rest })}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M8 2.2c.7-1 2-1.3 2.9-.6.9.7 1.2 1.9 1 2.8.9.2 1.7.8 2.1 1.6.5.9.3 2-.4 2.7 1 .2 1.7 1 1.9 1.9.2.9-.2 1.9-1 2.5-.7.5-1.7.6-2.4.2-.4.9-1.2 1.5-2.1 1.6-.9.1-1.8-.3-2.4-1-.7.6-1.7.7-2.5.2-.9-.5-1.4-1.5-1.3-2.4-.8-.2-1.5-.8-1.9-1.6-.4-.8-.3-1.9.4-2.7-.9-.3-1.6-1-1.9-1.9-.2-.9.2-1.9 1-2.5.7-.5 1.7-.6 2.4-.2z" />
    </svg>
  );
}