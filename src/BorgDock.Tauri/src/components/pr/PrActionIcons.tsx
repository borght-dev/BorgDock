import type { SVGProps } from 'react';

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export function BranchIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <path d="M4 4.5v7" />
      <path d="M12 7.5c0 2.5-2 3.5-4 3.5" />
    </svg>
  );
}

export function EyeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

export function MergeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1v3.6" />
      <path d="M8 11.4V15" />
    </svg>
  );
}

export function RefreshIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M14 3v4h-4" />
      <path d="M2 13v-4h4" />
      <path d="M13.4 8a5.5 5.5 0 0 1-9.6 3.4L2 9" />
      <path d="M2.6 8a5.5 5.5 0 0 1 9.6-3.4L14 7" />
    </svg>
  );
}

export function ExternalIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M9 2h5v5" />
      <path d="M14 2 7.5 8.5" />
      <path d="M13 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3.5" />
    </svg>
  );
}

export function MoreHIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)} strokeWidth={2}>
      <circle cx="3.5" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

export function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M3 11V3a1 1 0 0 1 1-1h7" />
    </svg>
  );
}

export function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="m3 8 3.5 3.5L13 5" />
    </svg>
  );
}

export type PrActionIconKind =
  | 'branch'
  | 'eye'
  | 'merge'
  | 'refresh'
  | 'external'
  | 'more'
  | 'copy'
  | 'check';

export function PrActionIcon({ kind, size = 12 }: { kind: PrActionIconKind; size?: number }) {
  switch (kind) {
    case 'branch':
      return <BranchIcon size={size} />;
    case 'eye':
      return <EyeIcon size={size} />;
    case 'merge':
      return <MergeIcon size={size} />;
    case 'refresh':
      return <RefreshIcon size={size} />;
    case 'external':
      return <ExternalIcon size={size} />;
    case 'more':
      return <MoreHIcon size={size} />;
    case 'copy':
      return <CopyIcon size={size} />;
    case 'check':
      return <CheckIcon size={size} />;
  }
}
