import { SectionHeading } from '../SectionHeading';

const ROWS: readonly [string, string][] = [
  ['⌘⇧P', 'Toggle sidebar'],
  ['⌘K', 'Command palette'],
  ['⌘P', 'File palette (cross-repo)'],
  ['⌘L', 'Query window'],
  ['J / K', 'Next / previous PR'],
  ['O', 'Open PR on GitHub'],
  ['A / R', 'Approve / request changes'],
  ['M', 'Merge when green'],
  ['W', 'Open in worktree'],
  ['C', 'Send context to Claude Code'],
];

export function ShortcutsFeature() {
  return (
    <section className="section">
      <div className="grid-2col grid-2col--shortcuts">
        <SectionHeading
          kicker="KEYBOARD"
          title={
            <>
              Every action{' '}
              <em style={{ color: 'var(--color-text-tertiary)' }}>has a key.</em>
            </>
          }
          lede="Review a whole queue without lifting your hand. The command palette remembers the ones you forget."
        />
        <div
          style={{
            border: '1px solid var(--color-subtle-border)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--color-surface)',
          }}
        >
          {ROWS.map(([k, d], i) => (
            <div
              key={k}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                padding: '10px 18px',
                alignItems: 'center',
                borderTop: i === 0 ? 0 : '1px solid var(--color-separator)',
                fontSize: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-code)',
                  fontWeight: 600,
                  color: 'var(--color-accent)',
                }}
              >
                {k}
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
