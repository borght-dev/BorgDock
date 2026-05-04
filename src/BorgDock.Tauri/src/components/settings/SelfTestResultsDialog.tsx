import { Button, Pill } from '@/components/shared/primitives';

export interface SelfTestResult {
  service: string;
  ok: boolean;
  message: string;
}

interface Props {
  isOpen: boolean;
  results: SelfTestResult[];
  onClose: () => void;
}

export function SelfTestResultsDialog({ isOpen, results, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Self-test results"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay-bg)]"
    >
      <div className="w-[440px] rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]">Self-test results</h3>
        {results.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Running…</p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => (
              <li
                key={r.service}
                className="flex items-start gap-3 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)] px-3 py-2.5"
              >
                <Pill tone={r.ok ? 'success' : 'error'}>{r.ok ? '✓' : '✕'}</Pill>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{r.service}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{r.message}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
