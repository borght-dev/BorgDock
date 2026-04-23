import { WorkItemsList } from '../screens/WorkItemsList';
import { SectionHeading } from '../SectionHeading';

export function WorkItemsFeature() {
  return (
    <section className="section">
      <div className="grid-2col">
        <div>
          <SectionHeading
            kicker="AZURE DEVOPS"
            title={
              <>
                Work items, ranked <em style={{ color: 'var(--color-text-tertiary)' }}>alongside your PRs.</em>
              </>
            }
            lede="Auto-linked by branch or commit message. Sprint, state, tags, implementing PR — on one card. Edit state and assignment without leaving the dock."
          />
        </div>
        <div className="center-flex">
          <div className="mockup-scroll">
            <WorkItemsList width={420} height={580} />
          </div>
        </div>
      </div>
    </section>
  );
}
