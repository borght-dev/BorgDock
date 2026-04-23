import type React from 'react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import type { Kind } from '@/types/whats-new';

const KIND_GRADIENTS: Record<Kind, string> = {
  new: 'bg-[radial-gradient(ellipse_360px_180px_at_50%_0%,rgba(59,166,142,0.16),transparent_60%),linear-gradient(160deg,#1a1335_0%,#2a1f5e_100%)]',
  improved:
    'bg-[radial-gradient(ellipse_360px_180px_at_50%_0%,rgba(245,183,59,0.14),transparent_60%),linear-gradient(160deg,#2a1f5e_0%,#3a3015_100%)]',
  fixed:
    'bg-[radial-gradient(ellipse_360px_180px_at_50%_50%,rgba(124,106,246,0.22),transparent_65%),linear-gradient(160deg,#1a1335_0%,#2a2066_50%,#1a1335_100%)]',
};

const KIND_ICON: Record<Kind, React.ReactElement> = {
  new: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  improved: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />
    </svg>
  ),
  fixed: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />
    </svg>
  ),
};

interface Props {
  hero: { src: string; alt: string } | null;
  kind: Kind;
}

export function HeroBanner({ hero, kind }: Props) {
  const [errored, setErrored] = useState(false);
  if (hero && !errored) {
    return (
      <div className="h-[74px] overflow-hidden rounded-md border border-[var(--color-subtle-border)] mb-2.5">
        <img
          src={hero.src}
          alt={hero.alt}
          className="h-full w-full object-cover"
          onError={() => flushSync(() => setErrored(true))}
        />
      </div>
    );
  }

  return (
    <div
      data-fallback={kind}
      className={`h-[74px] overflow-hidden rounded-md border border-[var(--color-subtle-border)] mb-2.5 flex items-center justify-center text-[rgba(237,234,244,0.9)] ${KIND_GRADIENTS[kind]}`}
      aria-hidden="true"
    >
      {KIND_ICON[kind]}
    </div>
  );
}
