export interface RefreshIconProps {
  /** When true, rotates the icon using the
   * shared `sidebar-spin` keyframe defined in styles/index.css. */
  spinning?: boolean;

  /** Square pixel size. Defaults to 14. */
  size?: number;
}

export function RefreshIcon({ spinning = false, size = 14 }: RefreshIconProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        transformOrigin: '50% 50%',
        animation: spinning
          ? 'sidebar-spin 0.8s linear infinite'
          : undefined,
        willChange: spinning ? 'transform' : undefined,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="6" stroke="transparent" />

        <g transform="translate(16 0) scale(-1 1)">
          <path d="M3.2 6.1A5.05 5.05 0 1 1 3.2 9.9" />
          <path d="M3.2 6.1L3.2 3.9" />
          <path d="M3.2 6.1L5.4 6.1" />
        </g>
      </svg>
    </span>
  );
}
