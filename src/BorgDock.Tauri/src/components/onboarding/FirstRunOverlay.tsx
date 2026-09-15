import { X } from 'lucide-react';
import { Button, Card } from '@/components/shared/primitives';

interface FirstRunOverlayProps {
  message: string;
  ctaLabel: string;
  onCtaClick: () => void;
  onDismiss: () => void;
}

export function FirstRunOverlay({
  message,
  ctaLabel,
  onCtaClick,
  onDismiss,
}: FirstRunOverlayProps) {
  return (
    <div className="relative mx-2 mb-3 animate-[fadeSlideIn_0.2s_ease-out]" data-first-run-overlay>
      <Card variant="default" padding="lg" className="relative backdrop-blur-sm">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
        >
          <X size={12} strokeWidth={3} />
        </button>

        <p className="pr-6 text-sm font-medium text-[var(--color-text-primary)]">{message}</p>

        <Button
          variant="primary"
          size="md"
          className="mt-3"
          onClick={() => {
            onCtaClick();
            onDismiss();
          }}
        >
          {ctaLabel}
        </Button>
      </Card>
    </div>
  );
}
