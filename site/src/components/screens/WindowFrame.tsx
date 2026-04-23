import { BorgDockLogo } from '../ui/BorgDockLogo';
import { StatusDot } from '../ui/atoms';

interface WindowFrameProps {
  title: string;
  count?: string;
  width: number;
  height: number;
  children: React.ReactNode;
  statusbar?: string | false;
}

export function WindowFrame({
  title,
  count,
  width,
  height,
  children,
  statusbar = 'Updated 12s ago · 23 open · 2 failing',
}: WindowFrameProps) {
  return (
    <div
      className="prdock-app"
      style={{
        width,
        height,
        background: 'var(--color-background)',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--color-strong-border)',
        boxShadow: '0 20px 60px rgba(26,23,38,0.28)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-ui-system)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Titlebar */}
      <div
        style={{
          height: 36,
          padding: '0 6px 0 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--color-title-bar-bg, var(--color-surface-raised))',
          borderBottom: '1px solid var(--color-subtle-border)',
          backdropFilter: 'blur(16px)',
          flexShrink: 0,
        }}
      >
        <BorgDockLogo size={20} />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</span>
        {count != null && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 7px',
              borderRadius: 9999,
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              fontWeight: 600,
            }}
          >
            {count}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <WindowControls />
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--color-background)',
        }}
      >
        {children}
      </div>

      {/* Statusbar */}
      {statusbar && (
        <div
          style={{
            height: 26,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderTop: '1px solid var(--color-subtle-border)',
            background: 'var(--color-status-bar-bg, var(--color-surface-raised))',
            fontSize: 10,
            fontFamily: 'var(--font-code)',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}
        >
          <StatusDot status="green" size={6} />
          <span>{statusbar}</span>
        </div>
      )}
    </div>
  );
}

const chromeBtn = {
  width: 28,
  height: 24,
  border: 0,
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--color-text-tertiary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
} as const;

function WindowControls() {
  return (
    <>
      <button type="button" aria-label="Detach" style={chromeBtn}>
        <ChromeSvg d="M6 3h7v7M13 3L6 10" />
      </button>
      <button type="button" aria-label="Minimize" style={chromeBtn}>
        <ChromeSvg d="M3 8h10" />
      </button>
      <button type="button" aria-label="Maximize" style={chromeBtn}>
        <ChromeSvg d="M3 3h10v10H3z" />
      </button>
      <button type="button" aria-label="Close" style={chromeBtn}>
        <ChromeSvg d="M3 3l10 10M13 3L3 13" />
      </button>
    </>
  );
}

function ChromeSvg({ d, size = 12 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/* --- Tab bar (shared across screens) --- */

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export function TabBar({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        borderBottom: '1px solid var(--color-subtle-border)',
        padding: '0 22px',
        background: 'var(--color-surface)',
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <div
            key={t.id}
            style={{
              padding: '10px 2px',
              fontSize: 12,
              fontWeight: 500,
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              borderBottom: `2px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: -1,
              cursor: 'pointer',
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                style={{
                  minWidth: 18,
                  height: 16,
                  padding: '0 5px',
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 600,
                  background: isActive ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {t.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
        padding: '8px 4px 6px',
      }}
    >
      {children}
    </div>
  );
}
