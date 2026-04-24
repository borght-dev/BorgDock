import { FilePalette } from '../screens/FilePalette';
import { SectionHeading } from '../SectionHeading';
import { ResponsiveMock } from '../ui/ResponsiveMock';

export function FilePaletteFeature() {
  return (
    <section className="section">
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <SectionHeading
          kicker="FILE PALETTE · Ctrl+F8"
          align="center"
          title={
            <>
              One fuzzy search across{' '}
              <em style={{ color: 'var(--color-text-tertiary)' }}>every repo you&apos;ve cloned.</em>
            </>
          }
          lede="Match paths across all clones in ~/src. Preview with syntax highlighting. Jump straight to the PR that touched the file last."
        />
      </div>
      <div className="mockup-frame mockup-frame--padded">
        <ResponsiveMock designWidth={780} designHeight={300}>
          <FilePalette width={780} />
        </ResponsiveMock>
      </div>
    </section>
  );
}
