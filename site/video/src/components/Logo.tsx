import { useId } from 'react';
import type { Palette } from '../theme';

/** The BorgDock mark, as in site/src/components/ui/BorgDockLogo.astro. */
export const Logo: React.FC<{ size: number; palette: Palette }> = ({ size, palette }) => {
  const id = `bd-logo-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={palette.logoStart} />
          <stop offset="100%" stopColor={palette.logoEnd} />
        </linearGradient>
      </defs>
      <rect width="16" height="16" rx="4.5" fill={`url(#${id})`} />
      <path
        d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
        stroke={palette.accentForeground}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
