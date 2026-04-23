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
    <div className="relative mx-2 mb-3 animate-[fadeSlideIn_0.2s_ease-out] rounded-xl border border-[var(--color-modal-border)] bg-[var(--color-modal-bg)] px-4 py-4 shadow-lg backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>

      <p className="pr-6 text-sm font-medium text-[var(--color-text-primary)]">{message}</p>

      <button
        onClick={() => {
          onCtaClick();
          onDismiss();
        }}
        className="mt-3 rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
