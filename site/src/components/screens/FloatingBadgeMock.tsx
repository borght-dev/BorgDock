import type { StatusKind } from '../ui/types';

interface FloatingBadgeMockProps {
  status?: Extract<StatusKind, 'green' | 'red' | 'yellow'>;
  count?: number;
  failing?: number;
  width?: number;
}

const GLOW: Record<FloatingBadgeMockProps['status'] & string, string> = {
  green: 'var(--color-badge-glow-green)',
  red: 'var(--color-badge-glow-red)',
  yellow: 'var(--color-badge-glow-yellow)',
};

const DOT: Record<FloatingBadgeMockProps['status'] & string, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
};

export function FloatingBadgeMock({
  status = 'red',
  count = 23,
  failing = 2,
  width = 360,
}: FloatingBadgeMockProps) {
  const glow = GLOW[status];
  const dotColor = DOT[status];

  return (
    <div
      className="prdock-app"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '8px 4px 8px 12px',
        width,
        borderRadius: 9999,
        background: 'var(--color-badge-glass)',
        border: '1px solid var(--color-badge-border)',
        backdropFilter: 'blur(20px)',
        boxShadow: `0 8px 32px ${glow}, 0 0 0 1px ${glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: status === 'red' ? 'rgba(229,64,101,0.12)' : 'rgba(125,211,192,0.12)',
          border: `1.5px solid ${dotColor}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}
        >
          {count} open · {failing} failing
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-code)',
            lineHeight: 1.3,
          }}
        >
          last sync 12s ago
        </div>
      </div>
      <button
        type="button"
        aria-label="Expand"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 0,
          background: 'var(--color-surface-hover)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          marginLeft: 6,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M6 3l4 5-4 5" />
        </svg>
      </button>
    </div>
  );
}
