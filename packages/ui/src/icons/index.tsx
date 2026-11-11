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

export function IconList({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6 4h8" />
      <path d="M6 8h8" />
      <path d="M6 12h8" />
      <path d="M2.5 4h.01" />
      <path d="M2.5 8h.01" />
      <path d="M2.5 12h.01" />
    </svg>
  );
}

export function IconGrid({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 4h.01" />
      <path d="M8 4h.01" />
      <path d="M12 4h.01" />
      <path d="M4 8h.01" />
      <path d="M8 8h.01" />
      <path d="M12 8h.01" />
      <path d="M4 12h.01" />
      <path d="M8 12h.01" />
      <path d="M12 12h.01" />
    </svg>
  );
}

export function IconPlus({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </svg>
  );
}

export function IconMoreHorizontal({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 8h.01" />
      <path d="M8 8h.01" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconSortAscending({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5 6.5 8 3.5l3 3" />
    </svg>
  );
}

export function IconSortDescending({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5 9.5 8 12.5l3-3" />
    </svg>
  );
}

export function IconChevronExpand({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5 6.5 8 4l3 2.5" />
      <path d="M5 9.5 8 12l3-2.5" />
    </svg>
  );
}

export function IconDownload({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 3v7" />
      <path d="M5.5 7.5 8 10l2.5-2.5" />
      <path d="M4 13h8" />
    </svg>
  );
}

export function IconSettings({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2.5v2" />
      <path d="M8 11.5v2" />
      <path d="M2.5 8h2" />
      <path d="M11.5 8h2" />
      <path d="m4 4 1.4 1.4" />
      <path d="m10.6 10.6 1.4 1.4" />
      <path d="m12 4-1.4 1.4" />
      <path d="m5.4 10.6-1.4 1.4" />
    </svg>
  );
}

export function IconKeyboard({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2" y="4" width="12" height="8" rx="1.5" />
      <path d="M4.5 7h.01" />
      <path d="M7 7h.01" />
      <path d="M9.5 7h.01" />
      <path d="M12 7h.01" />
      <path d="M5.5 10h5" />
    </svg>
  );
}

export function IconFeedback({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3 4h10v6.5H8L5.5 13V10.5H3z" />
      <path d="M5.5 6.5h5" />
      <path d="M5.5 8.5h3" />
    </svg>
  );
}

export function IconMail({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2" y="4" width="12" height="8" rx="1.5" />
      <path d="m3 5 5 4 5-4" />
    </svg>
  );
}

export function IconLogOut({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6.5 3H4v10h2.5" />
      <path d="M10.5 5.5 13 8l-2.5 2.5" />
      <path d="M13 8H6" />
    </svg>
  );
}

export function IconUser({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13.5c0-2.2 2-3.7 4.5-3.7s4.5 1.5 4.5 3.7" />
    </svg>
  );
}