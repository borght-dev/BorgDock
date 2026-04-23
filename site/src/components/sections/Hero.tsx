import { StatusDot } from '../ui/atoms';
import { FocusSidebar } from '../screens/FocusSidebar';

interface HeroProps {
  scale?: number;
}

export function Hero({ scale = 1 }: HeroProps) {
  return (
    <section className="section--hero">
      <div className="grid-2col grid-2col--hero">
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              fontFamily: 'var(--font-code)',
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              marginBottom: 28,
            }}
          >
            <StatusDot status="green" size={6} />
            <span>v0.14 · File Palette now cross-repo</span>
            <span style={{ color: 'var(--color-text-faint)' }}>—</span>
            <a
              href="/changelog"
              style={{ color: 'var(--color-accent)', textDecoration: 'none' }}
            >
              read the notes
            </a>
          </div>
          <h1
            className="prdock-display"
            style={{
              fontSize: `calc(clamp(56px, 7vw, 88px) * ${scale})`,
              lineHeight: 0.98,
              margin: 0,
              letterSpacing: '-0.03em',
              textWrap: 'balance',
            }}
          >
            Less context switching.
            <br />
            <em style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>More shipping.</em>
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--color-text-secondary)',
              maxWidth: 540,
              marginTop: 22,
              textWrap: 'pretty',
            }}
          >
            A docked cockpit for your open work. PRs ranked by what blocks whom, CI that
            surfaces the real error, worktrees that let Claude Code fix it without
            touching your main checkout. One keybinding brings it all up.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 30,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <a
              href="/download"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 18px',
                borderRadius: 6,
                background: 'var(--color-accent)',
                color: 'white',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              Download for macOS
              <span
                style={{
                  opacity: 0.7,
                  fontFamily: 'var(--font-code)',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                38 MB
              </span>
            </a>
            <a
              href="/download"
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: '10px 16px',
                borderRadius: 6,
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-subtle-border)',
                textDecoration: 'none',
                background: 'var(--color-surface)',
              }}
            >
              Windows · Linux
            </a>
            <span style={{ width: 10 }} />
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-code)',
                color: 'var(--color-text-muted)',
              }}
            >
              ⌘⇧P to toggle · free for individuals
            </span>
          </div>
        </div>
        <div className="end-flex">
          <div className="mockup-scroll">
            <FocusSidebar width={420} height={640} />
          </div>
        </div>
      </div>
    </section>
  );
}
