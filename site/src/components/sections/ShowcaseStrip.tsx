import { MainPRsWindow } from '../screens/MainPRsWindow';

const STATS: readonly [string, string][] = [
  ['23', 'PRs across 4 repos ranked live by eight priority signals.'],
  ['10', 'CI checks streamed per PR, first real error extracted.'],
  ['6', 'Worktrees managed so Claude Code never collides with your branch.'],
  ['1', 'Keybinding to see it all. ⌘⇧P.'],
];

export function ShowcaseStrip() {
  return (
    <section style={{ maxWidth: 1280, margin: '40px auto 0', padding: '0 32px' }}>
      <div className="mockup-frame">
        <div className="mockup-scroll">
          <div style={{ transform: 'scale(0.82)', transformOrigin: 'top center' }}>
            <MainPRsWindow width={1020} height={720} />
          </div>
        </div>
      </div>
      <div className="stats-grid">
        {STATS.map(([n, d]) => (
          <div key={d}>
            <div
              className="prdock-display"
              style={{ fontSize: 40, lineHeight: 1, letterSpacing: '-0.02em' }}
            >
              {n}
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                lineHeight: 1.5,
                marginTop: 10,
                textWrap: 'pretty',
              }}
            >
              {d}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
