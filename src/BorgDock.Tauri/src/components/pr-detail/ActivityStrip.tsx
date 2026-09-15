import { ChevronRight, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { SegmentedProgress } from '@/components/shared/primitives';

interface ActivityStripProps {
  passed: number;
  running: number;
  failing: number;
  total: number;
  onJumpToChecks: () => void;
}

/**
 * ActivityStrip — persistent "checks summary" pill between ActionBar and Tabs.
 * Click jumps to the Checks tab. Hidden entirely when total == 0.
 */
export function ActivityStrip({
  passed,
  running,
  failing,
  total,
  onJumpToChecks,
}: ActivityStripProps) {
  if (total === 0) return null;

  const tone: 'red' | 'yellow' | 'green' = failing > 0 ? 'red' : running > 0 ? 'yellow' : 'green';

  const bg =
    tone === 'red'
      ? 'var(--color-error-badge-bg)'
      : tone === 'yellow'
        ? 'var(--color-warning-badge-bg)'
        : 'var(--color-success-badge-bg)';
  const border =
    tone === 'red'
      ? 'var(--color-status-red)'
      : tone === 'yellow'
        ? 'var(--color-status-yellow)'
        : 'var(--color-success-badge-border)';
  const fg =
    tone === 'red'
      ? 'var(--color-status-red)'
      : tone === 'yellow'
        ? 'var(--color-status-yellow)'
        : 'var(--color-status-green)';

  const headline =
    running > 0
      ? `${running} check${running === 1 ? '' : 's'} still running`
      : failing > 0
        ? `${failing} check${failing === 1 ? '' : 's'} failing`
        : 'All checks passed';

  return (
    <button
      type="button"
      onClick={onJumpToChecks}
      data-activity-strip
      style={{
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: tone === 'yellow' ? '0 0 0 4px rgba(218,158,32,0.08)' : 'none',
        transition: 'box-shadow 200ms ease',
      }}
      className="flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-left font-[inherit] text-[var(--color-text-primary)]"
      title="Jump to Checks"
    >
      <span
        style={{ color: fg, border: `1px solid ${fg}` }}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)]"
      >
        {running > 0 ? (
          <LoaderCircle size={14} strokeWidth={2.4} className="animate-spin" aria-hidden="true" />
        ) : failing > 0 ? (
          <CircleAlert size={14} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <CircleCheck size={14} strokeWidth={2.4} aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="text-[12.5px] font-semibold text-[var(--color-text-primary)]">
            {headline}
          </span>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {passed}/{total} passed
            {running > 0 && ` · ${running} in progress`}
            {failing > 0 && ` · ${failing} failing`}
          </span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
            View checks <ChevronRight size={11} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </div>
        <SegmentedProgress passed={passed} running={running} total={total} />
      </div>
    </button>
  );
}
