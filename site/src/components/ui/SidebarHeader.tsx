import { BorgDockLogo } from './BorgDockLogo';
import { IconBtn } from './atoms';

export type SidebarTab = 'focus' | 'prs' | 'workitems';

interface SidebarHeaderProps {
  activeTab?: SidebarTab;
  focusCount?: number;
  openCount?: number;
  failing?: number;
}

interface Tab {
  key: SidebarTab;
  label: string;
  badge?: number;
}

export function SidebarHeader({
  activeTab = 'focus',
  focusCount = 7,
  openCount = 23,
  failing = 2,
}: SidebarHeaderProps) {
  const tabs: Tab[] = [
    { key: 'focus', label: 'Focus', badge: focusCount },
    { key: 'prs', label: 'PRs' },
    { key: 'workitems', label: 'Work Items' },
  ];

  return (
    <div
      style={{
        padding: '10px 14px 0',
        borderBottom: '1px solid var(--color-subtle-border)',
        background: 'var(--color-sidebar-gradient-top)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <BorgDockLogo size={18} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
          BorgDock
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 9999,
            background: 'var(--color-surface-raised)',
            color: 'var(--color-text-muted)',
          }}
        >
          {openCount} open
        </span>
        {failing > 0 && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 9999,
              color: 'var(--color-status-red)',
              background: 'var(--color-error-badge-bg)',
              border: '1px solid var(--color-error-badge-border)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {failing} failing
          </span>
        )}
        <span style={{ flex: 1 }} />
        <IconBtn label="New">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M8 3v10M3 8h10" strokeLinecap="round" />
          </svg>
        </IconBtn>
        <IconBtn label="Settings">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="8" cy="8" r="2" />
            <path
              d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5"
              strokeLinecap="round"
            />
          </svg>
        </IconBtn>
      </div>
      <div style={{ display: 'flex', gap: 2, marginBottom: -1 }}>
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              style={{
                background: 'none',
                border: 0,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 500,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                borderBottom: `2px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                marginBottom: -1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              {t.label}
              {t.badge != null && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '0px 5px',
                    borderRadius: 9999,
                    background: isActive ? 'var(--color-accent)' : 'var(--color-surface-raised)',
                    color: isActive ? 'white' : 'var(--color-text-muted)',
                    fontWeight: 600,
                    minWidth: 14,
                    textAlign: 'center',
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
