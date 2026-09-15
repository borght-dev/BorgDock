import clsx from 'clsx';
import { CircleAlert } from 'lucide-react';
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
      <CircleAlert size={12} strokeWidth={2.25} className="shrink-0 text-[var(--color-accent)]" />
      {text}
    </button>
  );
}
