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
  // Six petals rotated around the centre; every point stays inside 0..16
  // (petal tip reaches 8-6.8=1.2 from the edge at most).
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
      {Array.from({ length: 6 }, (_, k) => (
        <ellipse
          key={k}
          cx="8"
          cy="4.6"
          rx="1.7"
          ry="3.4"
          transform={`rotate(${k * 60} 8 8)`}
        />
      ))}
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}