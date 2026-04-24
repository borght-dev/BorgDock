import { CiLogPanel } from '../screens/CiLogPanel';
import { SectionHeading } from '../SectionHeading';
import { ResponsiveMock } from '../ui/ResponsiveMock';

const ROWS: readonly [string, string][] = [
  ['log-parser.ts', 'Finds the real error in 2,847 lines in < 50ms'],
  ['worktrees/', 'Slot-3 ready. Main checkout untouched.'],
  ['handoff.md', 'Error + diff + affected files → Claude Code prompt'],
];

export function CiClaudeFeature() {
  return (
    <section className="section">
      <div className="grid-2col">
        <div>
          <SectionHeading
            kicker="CI · CLAUDE CODE"
            title={
              <>
                See the failing line.{' '}
                <em style={{ color: 'var(--color-text-tertiary)' }}>Fix it without leaving the dock.</em>
              </>
            }
            lede="BorgDock streams check logs, extracts the first real error — not the last 2,000 noisy lines — and hands the failure to Claude Code inside a pre-spawned git worktree. You review. It codes."
          />
          <div
            style={{
              marginTop: 28,
              border: '1px solid var(--color-subtle-border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--color-surface)',
              fontFamily: 'var(--font-code)',
              fontSize: 12,
            }}
          >
            {ROWS.map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  padding: '10px 14px',
                  borderTop: i === 0 ? 0 : '1px solid var(--color-separator)',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <span style={{ color: 'var(--color-accent)', fontWeight: 500, minWidth: 130 }}>{k}</span>
                <span
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 13,
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="center-flex">
          <ResponsiveMock designWidth={520} designHeight={360}>
            <CiLogPanel width={520} />
          </ResponsiveMock>
        </div>
      </div>
    </section>
  );
}
