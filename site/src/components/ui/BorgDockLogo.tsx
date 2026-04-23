interface BorgDockLogoProps {
  size?: number;
}

let gradId = 0;

export function BorgDockLogo({ size = 22 }: BorgDockLogoProps) {
  // Unique gradient id per instance — duplicate ids would collide in SSR.
  const id = `bd-logo-grad-${++gradId}`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="16" y2="16">
          <stop offset="0%" stopColor="#7c6af6" />
          <stop offset="100%" stopColor="#6655d4" />
        </linearGradient>
      </defs>
      <rect width="16" height="16" rx="4.5" fill={`url(#${id})`} />
      <path
        d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="9" r="1.3" fill="white" opacity="0.85" />
    </svg>
  );
}
