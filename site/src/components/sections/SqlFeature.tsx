import { SqlWindow } from '../screens/SqlWindow';
import { SectionHeading } from '../SectionHeading';
import { ResponsiveMock } from '../ui/ResponsiveMock';

export function SqlFeature() {
  return (
    <section className="section">
      <div className="grid-2col grid-2col--sql">
        <div>
          <SectionHeading
            kicker="QUERY · Ctrl+F10"
            title={
              <>
                A SQL window{' '}
                <em style={{ color: 'var(--color-text-tertiary)' }}>where you already are.</em>
              </>
            }
            lede="SQL Server, Postgres, MySQL. Run, scroll, copy. Read-only by default; saved connections; results cached for instant re-scroll."
          />
        </div>
        <div className="center-flex">
          <ResponsiveMock designWidth={620} designHeight={440}>
            <SqlWindow width={620} height={440} />
          </ResponsiveMock>
        </div>
      </div>
    </section>
  );
}
