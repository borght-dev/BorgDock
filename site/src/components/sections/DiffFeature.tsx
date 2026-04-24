import { DiffViewer } from '../screens/DiffViewer';
import { SectionHeading } from '../SectionHeading';
import { ResponsiveMock } from '../ui/ResponsiveMock';

export function DiffFeature() {
  return (
    <section className="section section--wide">
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <SectionHeading
          kicker="DIFF"
          align="center"
          title={
            <>
              Split view.{' '}
              <em style={{ color: 'var(--color-text-tertiary)' }}>vs HEAD or vs base,</em> one toggle.
            </>
          }
          lede="Full diff viewer with file tree, split or unified, and a HEAD/base switch so you can tell what changed locally from what the PR is actually proposing."
        />
      </div>
      <div className="mockup-frame mockup-frame--bordered">
        <ResponsiveMock designWidth={1180} designHeight={720}>
          <DiffViewer width={1180} height={720} />
        </ResponsiveMock>
      </div>
    </section>
  );
}
