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

export function IconLink({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <title>Link</title>
      <path d="M6.5 9.5 9.5 6.5" />
      <path d="M7 4.5 8.5 3A2.5 2.5 0 0 1 12 6.5L10.5 8" />
      <path d="M9 11.5 7.5 13A2.5 2.5 0 0 1 4 9.5L5.5 8" />
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

export function IconChevronUp({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3 10 8 5l5 5" />
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

export function IconUpload({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 12V3M4.5 6.5 8 3l3.5 3.5" />
      <path d="M3 11v2.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V11" />
    </svg>
  );
}

export function IconSliders({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M2 4h12M2 8h12M2 12h12" />
      <path d="M6 2v4M10 6v4M5 10v4" />
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
export function IconChevronLeft({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

export function IconFolder({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M2 4.5h4l1.5 1.5H14v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function IconFolderPlus({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M2 4.5h4l1.5 1.5H14v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />
      <path d="M8 9v3M6.5 10.5h3" />
    </svg>
  );
}

export function IconFile({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 2.5h5l3 3v8H4Z" />
      <path d="M9 2.5v3h3" />
    </svg>
  );
}

export function IconFileTex({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 2.5h5l3 3v8H4Z" />
      <path d="M9 2.5v3h3" />
      <path d="m5.5 8.5 1.5 2 1.5-2M8 8.5v4" />
    </svg>
  );
}

export function IconFileBib({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 2.5h5l3 3v8H4Z" />
      <path d="M9 2.5v3h3" />
      <path d="M6 9.5h4M6 11.5h4" />
    </svg>
  );
}

export function IconFileImage({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 2.5h5l3 3v8H4Z" />
      <path d="M9 2.5v3h3" />
      <circle cx="6.5" cy="8.5" r=".5" />
      <path d="m4.5 12 2.5-2 1.5 1.5L10 10l2 2" />
    </svg>
  );
}

export function IconFileCsv({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M4 2.5h5l3 3v8H4Z" />
      <path d="M9 2.5v3h3" />
      <path d="M5.5 9h5M5.5 11h5" />
    </svg>
  );
}

export function IconChat({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2Z" />
    </svg>
  );
}

export function IconRefresh({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M13 8a5 5 0 1 1-1.5-3.5" />
      <path d="M13 2.5v3h-3" />
    </svg>
  );
}

export function IconPanelLeftClose({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6 3v10" />
      <path d="m10.5 6.5-2 1.5 2 1.5" />
    </svg>
  );
}

export function IconTools({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="3" r="1.25" />
      <circle cx="8" cy="13" r="1.25" />
    </svg>
  );
}

export function IconMic({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M4 8a4 4 0 0 0 8 0M8 12v2" />
    </svg>
  );
}

export function IconArrowUp({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 13V3M4.5 6.5 8 3l3.5 3.5" />
    </svg>
  );
}

export function IconStop({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function IconCopy({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" />
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function IconPaperclip({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="m9.5 4.5-5 5a2.5 2.5 0 0 0 3.5 3.5l5-5a1.5 1.5 0 0 0-2-2l-5 5a.5.5 0 0 0 .7.7l4.5-4.5" />
    </svg>
  );
}

export function IconSparkle({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M8 2.5c.4 2.8 1.7 4.1 4.5 4.5-2.8.4-4.1 1.7-4.5 4.5-.4-2.8-1.7-4.1-4.5-4.5C6.3 6.6 7.6 5.3 8 2.5Z" />
      <path d="M12.5 10.5c.2 1.2.8 1.8 2 2-1.2.2-1.8.8-2 2-.2-1.2-.8-1.8-2-2 1.2-.2 1.8-.8 2-2Z" />
    </svg>
  );
}

export function IconPencil({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="m9.5 3.5 3 3-7 7L3 14l.5-2.5Z" />
      <path d="m8.5 4.5 3 3" />
    </svg>
  );
}

export function IconTrash({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3.5 4.5h9M6 4.5v-2h4v2M5 4.5l.5 9h5l.5-9M7 7v4M9 7v4" />
    </svg>
  );
}

export function IconFit({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6 3H3v3M10 3h3v3M6 13H3v-3M10 13h3v-3" />
    </svg>
  );
}

export function IconBraces({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6 3.5c-1.5 0-1.5 1-1.5 2.5 0 1.5-.5 2-1.5 2 1 0 1.5.5 1.5 2 0 1.5 0 2.5 1.5 2.5M10 3.5c1.5 0 1.5 1 1.5 2.5 0 1.5.5 2 1.5 2-1 0-1.5.5-1.5 2 0 1.5 0 2.5-1.5 2.5" />
    </svg>
  );
}

export function IconDatabase({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <ellipse cx="8" cy="3.5" rx="4.5" ry="1.5" />
      <path d="M3.5 3.5v9c0 .8 2 1.5 4.5 1.5s4.5-.7 4.5-1.5v-9" />
      <path d="M3.5 8c0 .8 2 1.5 4.5 1.5S12.5 8.8 12.5 8" />
    </svg>
  );
}

export function IconBeta({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M6 12V4h2.5a2 2 0 0 1 0 4H6M6 8h3a2 2 0 0 1 0 4H6" />
    </svg>
  );
}

export function IconIntegrations({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <rect x="2.5" y="2.5" width="4" height="4" rx="1" />
      <rect x="9.5" y="2.5" width="4" height="4" rx="1" />
      <rect x="2.5" y="9.5" width="4" height="4" rx="1" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="1" />
    </svg>
  );
}

export function IconSpinner({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className: [className, "animate-spin"].filter(Boolean).join(" "), ...rest })}>
      <circle cx="8" cy="8" r="5.5" opacity=".25" />
      <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" />
    </svg>
  );
}

export function IconUndo({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.5 6.5h6.25a3.75 3.75 0 0 1 0 7.5H6.5" />
    </svg>
  );
}

export function IconRedo({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="m10.5 3.5 3 3-3 3" />
      <path d="M13.5 6.5H7.25a3.75 3.75 0 0 0 0 7.5h2.25" />
    </svg>
  );
}

export function IconArrowRight({ size, className, ...rest }: IconProps) {
  return (
    <svg {...base({ size, className, ...rest })}>
      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />
    </svg>
  );
}
