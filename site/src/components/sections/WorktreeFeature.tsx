import { WorktreePalette } from '../screens/WorktreePalette';
import { SectionHeading } from '../SectionHeading';
import { ResponsiveMock } from '../ui/ResponsiveMock';

export function WorktreeFeature() {
  return (
    <section className="section">
      <div className="grid-2col">
        <div>
          <SectionHeading
            kicker="WORKTREE PALETTE · Ctrl+F7"
            title={
              <>
                Every branch,{' '}
                <em style={{ color: 'var(--color-text-tertiary)' }}>one palette.</em>
              </>
            }
            lede="Lists every worktree across every configured repo. Favorite the ones you revisit. Open terminal, folder, or editor — one key, one hop."
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
            {[
              ['Grouped by repo', 'Sorted main → favorites → the rest.'],
              ['Fuzzy filter', 'Match by branch, folder, or owner/name.'],
              ['One-key actions', 'Terminal, folder, editor — inline.'],
              ['Pre-spawned', "Claude Code gets a ready worktree when CI goes red — no collision with your checkout."],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  padding: '10px 14px',
                  borderTop: '1px solid var(--color-separator)',
                  alignItems: 'baseline',
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
          <ResponsiveMock designWidth={520} designHeight={440}>
            <WorktreePalette width={520} />
          </ResponsiveMock>
        </div>
      </div>
    </section>
  );
}
