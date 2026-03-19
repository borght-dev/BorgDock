export function DoneStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      {/* Success checkmark */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-action-success-bg)] border-2 border-[var(--color-success-badge-border)] animate-[scale-in_0.3s_ease-out]">
        <span className="text-2xl text-[var(--color-status-green)]">&#10003;</span>
      </div>

      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">You're all set!</h2>
      <p className="text-xs text-[var(--color-text-tertiary)] text-center max-w-xs">
        PRDock is configured and ready to monitor your pull requests. You can adjust these settings
        anytime from the gear icon.
      </p>
    </div>
  );
}
