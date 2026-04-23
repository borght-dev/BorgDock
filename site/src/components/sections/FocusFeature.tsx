import { StatusDot } from '../ui/atoms';
import { FocusSidebar } from '../screens/FocusSidebar';
import { SectionHeading } from '../SectionHeading';
import type { StatusKind } from '../ui/types';

const RULES: readonly [StatusKind, string, string][] = [
  ['green', 'Ready to merge', 'Approved + green + mergeable. Surfaces first.'],
  ['red', 'Build failing', "Your PR with red checks, ranked up by how long it’s been broken."],
  ['yellow', 'Review overdue', 'Requested > 2 days ago — team SLA signal on the card.'],
  ['gray', 'Stale draft', "Your own WIP. Kept out of everyone else’s way."],
];

export function FocusFeature() {
  return (
    <section className="section">
      <div className="grid-2col">
        <div>
          <SectionHeading
            kicker="FOCUS"
            title={
              <>
                Triage by urgency,{' '}
                <em style={{ color: 'var(--color-text-tertiary)' }}>not by order opened.</em>
              </>
            }
            lede="Every PR scored on eight signals — approvals, failing checks, review age, contributor weight, blast radius. The tab re-sorts in real time so the next thing to do is always on top."
          />
          <div
            style={{
              marginTop: 26,
              display: 'grid',
              gap: 1,
              background: 'var(--color-subtle-border)',
              border: '1px solid var(--color-subtle-border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {RULES.map(([dot, t, d]) => (
              <div
                key={t}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '14px 1fr',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--color-surface)',
                  alignItems: 'start',
                }}
              >
                <span style={{ marginTop: 5 }}>
                  <StatusDot status={dot} />
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      marginTop: 2,
                      lineHeight: 1.5,
                    }}
                  >
                    {d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="center-flex">
          <div className="mockup-scroll">
            <FocusSidebar width={400} height={640} />
          </div>
        </div>
      </div>
    </section>
  );
}
