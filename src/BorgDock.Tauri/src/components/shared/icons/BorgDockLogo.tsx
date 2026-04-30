import type { SVGProps } from 'react';

interface BorgDockLogoProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
}

/**
 * BorgDock brand mark — used in window title bars and shell chrome.
 * Lives at one source so every window stays visually anchored to the brand.
 */
export function BorgDockLogo({ size = 22, id, ...rest }: BorgDockLogoProps) {
  // Each call gets a unique gradient id so multiple logos on one page don't
  // collide (ids are document-global in SVG <defs>).
  const gradientId = id ?? `bd-logo-grad-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...rest}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="16" y2="16">
          <stop offset="0%" stopColor="var(--color-logo-gradient-start)" />
          <stop offset="100%" stopColor="var(--color-logo-gradient-end)" />
        </linearGradient>
      </defs>
      <rect width="16" height="16" rx="4.5" fill={`url(#${gradientId})`} />
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
