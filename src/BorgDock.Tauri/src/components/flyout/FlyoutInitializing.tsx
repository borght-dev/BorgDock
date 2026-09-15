import { BorgDockLogo } from '@/components/shared/icons';
import { FlyoutFrame } from './FlyoutFrame';

/**
 * Rendered only when the flyout is opened before the main window has synced
 * any data. Mirrors the glance layout (header + rows) with skeleton rows so
 * the switch to the real glance doesn't jump.
 */
export function FlyoutInitializing() {
  return (
    <FlyoutFrame>
      <div
        className="shrink-0 border-b px-4 pt-3.5 pb-3"
        // style: gradient background — no Tailwind utility covers multi-stop CSS gradients with tokens
        style={{
          borderColor: 'var(--color-subtle-border)',
          background: 'linear-gradient(135deg, var(--color-surface-raised), transparent)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <BorgDockLogo size={28} />
          <div>
            <div className="text-[13px] font-bold tracking-tight text-[var(--color-text-primary)]">
              BorgDock
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
              Loading pull requests…
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 p-2" aria-busy="true" data-testid="flyout-initializing">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex animate-pulse items-center gap-3 rounded-lg px-2.5 py-2.5">
            <div className="h-6 w-6 shrink-0 rounded-full bg-[var(--color-surface-hover)]" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-2.5 w-3/4 rounded bg-[var(--color-surface-hover)]" />
              <div className="h-2 w-1/2 rounded bg-[var(--color-surface-hover)]" />
            </div>
          </div>
        ))}
      </div>
    </FlyoutFrame>
  );
}
