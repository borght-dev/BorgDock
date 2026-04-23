import { FilePalette } from '../screens/FilePalette';
import { SectionHeading } from '../SectionHeading';

export function FilePaletteFeature() {
  return (
    <section className="section">
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <SectionHeading
          kicker="FILE PALETTE · ⌘P"
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
        <div className="mockup-scroll">
          <FilePalette width={780} />
        </div>
      </div>
    </section>
  );
}
