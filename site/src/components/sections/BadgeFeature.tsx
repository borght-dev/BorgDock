import { FloatingBadgeMock } from '../screens/FloatingBadgeMock';
import { SectionHeading } from '../SectionHeading';
import { ResponsiveMock } from '../ui/ResponsiveMock';

export function BadgeFeature() {
  return (
    <section className="section">
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionHeading
          kicker="FLOATING BADGE · ⌘⇧B"
          align="center"
          title={
            <>
              Hide the dock.{' '}
              <em style={{ color: 'var(--color-text-tertiary)' }}>Keep the signal.</em>
            </>
          }
          lede="Always-on-top capsule. Count and worst status. Click to expand, double-click to reopen the full dock."
        />
      </div>
      <div className="mockup-frame--column">
        <ResponsiveMock designWidth={340} designHeight={96}>
          <FloatingBadgeMock status="red" count={23} failing={2} width={340} />
        </ResponsiveMock>
        <ResponsiveMock designWidth={340} designHeight={96}>
          <FloatingBadgeMock status="yellow" count={18} failing={0} width={340} />
        </ResponsiveMock>
        <ResponsiveMock designWidth={340} designHeight={96}>
          <FloatingBadgeMock status="green" count={11} failing={0} width={340} />
        </ResponsiveMock>
      </div>
    </section>
  );
}
