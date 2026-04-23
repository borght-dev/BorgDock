import { PrDetail } from '../screens/PrDetail';
import { WorkItemsList } from '../screens/WorkItemsList';
import { SectionHeading } from '../SectionHeading';

export function DetailAndWork() {
  return (
    <section className="section">
      <div className="grid-2col grid-2col--detail">
        <div>
          <SectionHeading
            kicker="PR DETAIL"
            title={
              <>
                All ten checks,{' '}
                <em style={{ color: 'var(--color-text-tertiary)' }}>one surface.</em>
              </>
            }
            lede="Every run in a flat list — click Send to Claude on the red ones."
          />
          <div style={{ marginTop: 26 }}>
            <div className="mockup-scroll">
              <div style={{ transform: 'scale(0.72)', transformOrigin: 'top left' }}>
                <PrDetail width={720} height={640} />
              </div>
            </div>
          </div>
        </div>
        <div>
          <SectionHeading
            kicker="AZURE DEVOPS"
            title={
              <>
                Work items. In the dock.{' '}
                <em style={{ color: 'var(--color-text-tertiary)' }}>Finally.</em>
              </>
            }
            lede="Auto-linked by branch or commit. Sprint, state, tags, implementing PR."
          />
          <div style={{ marginTop: 26 }}>
            <div className="mockup-scroll">
              <div style={{ transform: 'scale(0.82)', transformOrigin: 'top left' }}>
                <WorkItemsList width={400} height={560} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
