import type { SVGProps } from 'react';

interface BorgDockLogoProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
}

export function BorgDockLogo({ size = 22, ...rest }: BorgDockLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="var(--color-accent)"
      aria-hidden="true"
      {...rest}
    >
      <rect x="4" y="4" width="6" height="24" rx="1.5" />
      <path d="M14.5 4H22a6 6 0 0 1 6 6v1a4 4 0 0 1-4 4H14.5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 14.5 4ZM14.5 17H24a4 4 0 0 1 4 4v1a6 6 0 0 1-6 6h-7.5a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}
