export function FinalCta() {
  return (
    <section className="section">
      <div
        style={{
          padding: '56px 48px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-subtle-border)',
          borderRadius: 12,
        }}
      >
        <div className="grid-2col grid-2col--cta">
          <div>
            <h2
              className="prdock-display"
              style={{
                fontSize: 'clamp(40px, 4.6vw, 60px)',
                letterSpacing: '-0.025em',
                margin: 0,
                lineHeight: 1.02,
                textWrap: 'balance',
              }}
            >
              Dock it. Close{' '}
              <em style={{ color: 'var(--color-text-tertiary)' }}>every other tab.</em>
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                marginTop: 14,
                maxWidth: 520,
                lineHeight: 1.55,
              }}
            >
              Free for individuals. macOS · Windows · Linux. No cloud account, no
              tracking — reads your Git provider directly.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
            <a
              href="/download"
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: '12px 20px',
                borderRadius: 6,
                background: 'var(--color-accent)',
                color: 'white',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              Download BorgDock
            </a>
            <a
              href="/features"
              style={{
                fontSize: 13,
                padding: '11px 18px',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-subtle-border)',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              See all features
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
