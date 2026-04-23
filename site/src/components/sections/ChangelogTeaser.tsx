import { SectionHeading } from '../SectionHeading';

type Kind = 'new' | 'improved' | 'fixed';

interface Item {
  v: string;
  date: string;
  kind: Kind;
  title: string;
  body: string;
}

const ITEMS: Item[] = [
  {
    v: 'v0.14.0',
    date: 'Apr 18 · 2026',
    kind: 'new',
    title: 'File Palette goes cross-repo',
    body: 'Fuzzy match across every clone in ~/src. Preview with syntax highlighting.',
  },
  {
    v: 'v0.13.2',
    date: 'Apr 04 · 2026',
    kind: 'improved',
    title: 'Priority scoring rewrite',
    body: 'Eight-signal model. 40% less false-urgent on large queues.',
  },
  {
    v: 'v0.13.0',
    date: 'Mar 22 · 2026',
    kind: 'new',
    title: 'Quick Review mode',
    body: 'One-keybinding approval flow across a queue of PRs.',
  },
];

const KIND_COLOR: Record<Kind, string> = {
  new: 'var(--color-accent)',
  improved: 'var(--color-status-green)',
  fixed: 'var(--color-status-yellow)',
};

export function ChangelogTeaser() {
  return (
    <section className="section">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 28 }}>
        <SectionHeading
          kicker="SHIPPING"
          title={
            <>
              What&apos;s <em style={{ color: 'var(--color-text-tertiary)' }}>new.</em>
            </>
          }
        />
        <span style={{ flex: 1 }} />
        <a
          href="/changelog"
          style={{
            fontSize: 12,
            color: 'var(--color-accent)',
            fontWeight: 500,
            textDecoration: 'none',
            fontFamily: 'var(--font-code)',
          }}
        >
          Full changelog →
        </a>
      </div>
      <div
        style={{
          border: '1px solid var(--color-subtle-border)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--color-surface)',
        }}
      >
        {ITEMS.map((item, i) => (
          <div
            key={item.v}
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 100px 1fr',
              gap: 20,
              padding: '16px 20px',
              borderTop: i === 0 ? 0 : '1px solid var(--color-separator)',
              alignItems: 'baseline',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: KIND_COLOR[item.kind],
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-code)',
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                }}
              >
                {item.v}
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-code)',
              }}
            >
              {item.date}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{item.title}</div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-tertiary)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {item.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
