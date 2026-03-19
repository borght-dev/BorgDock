import clsx from 'clsx';
import type { SidebarEdge, ThemeMode } from '@/types';

interface PositionStepProps {
  sidebarEdge: SidebarEdge;
  theme: ThemeMode;
  onEdgeChange: (edge: SidebarEdge) => void;
  onThemeChange: (theme: ThemeMode) => void;
}

export function PositionStep({
  sidebarEdge,
  theme,
  onEdgeChange,
  onThemeChange,
}: PositionStepProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Customize Appearance
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Choose where the sidebar appears and your preferred theme
        </p>
      </div>

      {/* Sidebar position */}
      <div className="w-full max-w-sm">
        <label className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
          Sidebar Position
        </label>
        <div className="mt-2 flex gap-3">
          {(['left', 'right'] as const).map((edge) => (
            <button
              key={edge}
              className={clsx(
                'flex-1 flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 transition-all',
                sidebarEdge === edge
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-subtle-border)] hover:border-[var(--color-strong-border)]',
              )}
              onClick={() => onEdgeChange(edge)}
            >
              {/* Visual preview */}
              <div className="flex h-12 w-20 rounded border border-[var(--color-strong-border)] overflow-hidden">
                {edge === 'left' && (
                  <>
                    <div className="w-1/3 bg-[var(--color-accent)] opacity-30" />
                    <div className="flex-1 bg-[var(--color-surface-raised)]" />
                  </>
                )}
                {edge === 'right' && (
                  <>
                    <div className="flex-1 bg-[var(--color-surface-raised)]" />
                    <div className="w-1/3 bg-[var(--color-accent)] opacity-30" />
                  </>
                )}
              </div>
              <span className="text-xs font-medium text-[var(--color-text-primary)] capitalize">
                {edge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Theme selector */}
      <div className="w-full max-w-sm">
        <label className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
          Theme
        </label>
        <div className="mt-2 flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              className={clsx(
                'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                theme === t
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
              )}
              onClick={() => onThemeChange(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
