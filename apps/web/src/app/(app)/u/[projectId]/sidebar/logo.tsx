// Hand-drawn sidebar mark: white bars in a hexagonal prism in dark mode,
// black in light mode via currentColor, with no solid background plate.

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
    >
      <g transform="scale(0.333333)">
        <path
          d="M24 6.5 39 15v18L24 41.5 9 33V15z"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <g stroke="currentColor" strokeWidth={3.6} strokeLinecap="round">
          <path d="M16.3 34v-8" />
          <path d="M24 34V18" />
          <path d="M31.7 34V23" />
        </g>
      </g>
    </svg>
  );
}
