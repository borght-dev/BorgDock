import clsx from 'clsx';

export function ActionButton({
  label,
  icon,
  onClick,
  variant = 'default',
}: {
  label: string;
  icon?: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'accent' | 'purple' | 'success' | 'draft' | 'danger';
}) {
  const variantClasses = {
    default:
      'border-[var(--color-subtle-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]',
    accent:
      'border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]',
    purple:
      'border-[var(--color-purple-border,#6655D4)] text-[var(--color-purple,#9384F7)] hover:bg-[color-mix(in_srgb,var(--color-purple,#9384F7)_10%,transparent)]',
    success:
      'border-[var(--color-success-badge-border)] bg-[var(--color-action-success-bg,color-mix(in_srgb,var(--color-status-green)_15%,transparent))] text-[var(--color-status-green)] hover:opacity-90',
    draft:
      'border-[var(--color-draft-badge-border)] text-[var(--color-draft-badge-fg)] hover:bg-[color-mix(in_srgb,var(--color-draft-badge-fg)_10%,transparent)]',
    danger:
      'border-[var(--color-error-badge-border)] text-[var(--color-error-badge-fg)] hover:bg-[color-mix(in_srgb,var(--color-status-red)_10%,transparent)]',
  };

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={clsx(
        'flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors',
        variantClasses[variant],
      )}
    >
      {icon && <span className="text-[10px]">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
