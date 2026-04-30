interface TokenBarProps {
  pct: number;
  width?: number;
}

export function TokenBar({ pct, width = 60 }: TokenBarProps) {
  const fill =
    pct > 85 ? 'var(--color-status-red)' : pct > 65 ? 'var(--color-status-yellow)' : 'var(--color-accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width,
          height: 3,
          borderRadius: 999,
          background: 'var(--color-surface-hover)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: `${pct}%`,
            background: fill,
          }}
        />
      </div>
      <span className="bd-mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
        {pct}%
      </span>
    </div>
  );
}
