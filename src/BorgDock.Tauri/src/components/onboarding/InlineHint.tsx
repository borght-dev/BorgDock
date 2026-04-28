import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { type HintId, useOnboardingStore } from '@/stores/onboarding-store';

interface InlineHintProps {
  hintId: HintId;
  text: string;
  timeoutMs?: number;
}

export function InlineHint({ hintId, text, timeoutMs = 10000 }: InlineHintProps) {
  const dismissedHints = useOnboardingStore((s) => s.dismissedHints);
  const dismissHint = useOnboardingStore((s) => s.dismissHint);
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    setFading(true);
    setTimeout(() => dismissHint(hintId), 200);
  }, [dismissHint, hintId]);

  useEffect(() => {
    if (dismissedHints.has(hintId)) return;
    const timer = setTimeout(() => dismiss(), timeoutMs);
    return () => clearTimeout(timer);
  }, [hintId, timeoutMs, dismiss, dismissedHints]);

  if (dismissedHints.has(hintId)) return null;

  return (
    <button
      onClick={dismiss}
      className={clsx(
        'mb-2 flex w-full items-center gap-2 rounded-md border-l-2',
        'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-1.5',
        'text-left text-[10px] text-[var(--color-text-secondary)]',
        'transition-opacity duration-[var(--duration-ui)]',
        fading ? 'opacity-0' : 'opacity-100',
      )}
      data-onboarding-hint
      data-hint-id={hintId}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="shrink-0 text-[var(--color-accent)]"
      >
        <circle cx="8" cy="8" r="7" />
        <path d="M8 5v3M8 10.5v.5" />
      </svg>
      {text}
    </button>
  );
}
