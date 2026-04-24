import { SectionHeading } from '../SectionHeading';

const ROWS: readonly [string, string][] = [
  ['Ctrl+Super+Shift+G', 'Toggle dock'],
  ['Ctrl+Super+Shift+F', 'Toggle flyout'],
  ['Ctrl+F7', 'Worktree palette'],
  ['Ctrl+F8', 'File palette (cross-repo)'],
  ['Ctrl+F9', 'Command palette'],
  ['Ctrl+F10', 'SQL workbench'],
  ['J / K', 'Next / previous PR'],
  ['O', 'Open PR on GitHub'],
  ['A / S', 'Approve / skip (Quick Review)'],
  ['M', 'Merge when green'],
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
                gridTemplateColumns: '160px 1fr',
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
