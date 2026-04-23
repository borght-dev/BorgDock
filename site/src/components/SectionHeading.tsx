interface TitleParts {
  /** Text before the emphasized phrase. */
  lead: string;
  /** The phrase rendered in emphasized (muted, un-italic) style. */
  em: string;
  /** Text after the emphasized phrase. */
  trail?: string;
}

interface SectionHeadingProps {
  kicker?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /**
   * Either a React node (for callers that want full control) or a structured
   * `{ lead, em, trail }` object so .astro pages can stay string-based.
   */
  title: React.ReactNode | TitleParts;
  lede?: React.ReactNode;
  align?: 'left' | 'center';
}

function isTitleParts(v: unknown): v is TitleParts {
  return typeof v === 'object' && v !== null && 'lead' in v && 'em' in v;
}

function renderTitle(title: SectionHeadingProps['title']): React.ReactNode {
  if (isTitleParts(title)) {
    return (
      <>
        {title.lead}
        <em>{title.em}</em>
        {title.trail}
      </>
    );
  }
  return title;
}

/**
 * Marketing section heading: kicker (monospace) + title (display) + lede.
 * `kicker` is the home-page style (muted monospace); `eyebrow` is the
 * subpage style (uppercase accent) — pass whichever the caller needs.
 */
export function SectionHeading({
  kicker,
  eyebrow,
  title,
  lede,
  align = 'left',
}: SectionHeadingProps) {
  const centered = align === 'center';
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: centered ? 760 : 640,
        marginInline: centered ? 'auto' : 0,
      }}
    >
      {kicker && (
        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-code)',
            color: 'var(--color-text-muted)',
            marginBottom: 14,
            letterSpacing: '0.04em',
          }}
        >
          {kicker}
        </div>
      )}
      {eyebrow && (
        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-code)',
            fontWeight: 500,
            color: 'var(--color-accent)',
            textTransform: 'uppercase',
            letterSpacing: 1.6,
            marginBottom: 18,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        className="prdock-display"
        style={{
          fontSize: eyebrow ? 'clamp(38px, 4.4vw, 56px)' : 'clamp(34px, 3.8vw, 48px)',
          lineHeight: 1.05,
          margin: 0,
          letterSpacing: '-0.02em',
          textWrap: 'balance',
        }}
      >
        {renderTitle(title)}
      </h2>
      {lede && (
        <p
          style={{
            fontSize: eyebrow ? 17 : 15,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            marginTop: eyebrow ? 18 : 16,
            textWrap: 'pretty',
            maxWidth: 560,
            marginInline: centered ? 'auto' : 0,
          }}
        >
          {lede}
        </p>
      )}
    </div>
  );
}
