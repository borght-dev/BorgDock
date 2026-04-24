interface WorktreePaletteProps {
  width?: number;
}

interface Worktree {
  branch: string;
  folder: string;
  parent: string;
  main?: boolean;
  favorite?: boolean;
  selected?: boolean;
  detached?: boolean;
}

interface RepoGroup {
  repo: string;
  count: number;
  entries: Worktree[];
}

const GROUPS: RepoGroup[] = [
  {
    repo: 'acme/prdock',
    count: 4,
    entries: [
      { branch: 'main', folder: 'prdock', parent: '~/src', main: true },
      { branch: 'gh-polling-backoff', folder: 'wt-polling-backoff', parent: '~/src/prdock.worktrees', favorite: true, selected: true },
      { branch: 'sqlite-wal', folder: 'wt-sqlite-wal', parent: '~/src/prdock.worktrees', favorite: true },
      { branch: 'palette-fuzzy', folder: 'wt-palette-fuzzy', parent: '~/src/prdock.worktrees' },
    ],
  },
  {
    repo: 'acme/tauri-db',
    count: 2,
    entries: [
      { branch: 'main', folder: 'tauri-db', parent: '~/src', main: true },
      { branch: 'wal-migrations', folder: 'wt-wal-migrations', parent: '~/src/tauri-db.worktrees' },
    ],
  },
];

export function WorktreePalette({ width = 520 }: WorktreePaletteProps) {
  return (
    <div
      className="prdock-app"
      style={{
        width,
        background: 'var(--color-modal-bg, var(--color-surface))',
        border: '1px solid var(--color-modal-border, var(--color-strong-border))',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.32)',
        fontFamily: 'var(--font-ui)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Titlebar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-subtle-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 2v12M12 8c0-3-2-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="4" cy="14" r="1.6" fill="currentColor" />
              <circle cx="4" cy="2" r="1.6" fill="currentColor" />
              <circle cx="12" cy="8" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Worktrees
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-code)',
              color: 'var(--color-text-muted)',
              padding: '1px 6px',
              borderRadius: 9999,
              background: 'var(--color-surface-raised)',
            }}
          >
            6
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, color: 'var(--color-text-tertiary)' }}>
          <ChromeBtn>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
            </svg>
          </ChromeBtn>
          <ChromeBtn>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" />
              <path d="M12.5 1v3.5H9M3.5 15v-3.5H7" />
            </svg>
          </ChromeBtn>
          <ChromeBtn>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </ChromeBtn>
        </div>
      </div>

      {/* Search */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--color-subtle-border)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ color: 'var(--color-text-muted)' }} aria-hidden>
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: 'var(--font-code)',
            color: 'var(--color-text-primary)',
          }}
        >
          wal
        </span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--color-text-muted)' }}>
          2 repos · 6 worktrees
        </span>
      </div>

      {/* Groups */}
      <div style={{ padding: '4px 0' }}>
        {GROUPS.map((g) => (
          <div key={g.repo}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                padding: '10px 14px 6px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
              }}
            >
              <span>{g.repo}</span>
              <span style={{ fontFamily: 'var(--font-code)', color: 'var(--color-text-faint)' }}>
                {g.count}
              </span>
            </div>
            {g.entries.map((e) => (
              <WorktreeRow key={e.branch} entry={e} />
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 'auto',
          padding: '6px 14px',
          borderTop: '1px solid var(--color-subtle-border)',
          fontSize: 10,
          fontFamily: 'var(--font-code)',
          color: 'var(--color-text-muted)',
          display: 'flex',
          gap: 16,
        }}
      >
        <span>↑↓ navigate</span>
        <span>↵ open terminal</span>
        <span>esc close</span>
      </div>
    </div>
  );
}

function WorktreeRow({ entry }: { entry: Worktree }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        background: entry.selected
          ? 'var(--color-selected-row-bg, var(--color-accent-subtle))'
          : 'transparent',
        borderLeft: `2px solid ${entry.selected ? 'var(--color-accent)' : 'transparent'}`,
      }}
    >
      {/* Favorite star */}
      <span
        style={{
          width: 14,
          height: 14,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: entry.favorite
            ? 'var(--color-status-yellow)'
            : 'var(--color-text-faint)',
          flexShrink: 0,
          visibility: entry.main ? 'hidden' : 'visible',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill={entry.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
        </svg>
      </span>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontFamily: 'var(--font-code)',
              color: entry.detached ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
              fontStyle: entry.detached ? 'italic' : 'normal',
              fontWeight: entry.main ? 600 : 500,
            }}
          >
            {entry.detached ? '(detached)' : entry.branch}
          </span>
          {entry.main && (
            <span
              style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 9999,
                background: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                fontWeight: 600,
                fontFamily: 'var(--font-code)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              main
            </span>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 2,
            fontSize: 11,
            fontFamily: 'var(--font-code)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>{entry.folder}</span>
          <span style={{ color: 'var(--color-text-faint)' }}>{entry.parent}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 2, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
        <RowActionBtn title="Open terminal">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 5l4 3-4 3" />
            <path d="M9 12h4" />
          </svg>
        </RowActionBtn>
        <RowActionBtn title="Open folder">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3A1 1 0 002 4.5z" />
          </svg>
        </RowActionBtn>
        <RowActionBtn title="Open editor">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
            <path d="M9.5 3.5l3 3" />
          </svg>
        </RowActionBtn>
      </div>
    </div>
  );
}

function ChromeBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      style={{
        width: 22,
        height: 22,
        border: 0,
        borderRadius: 4,
        background: 'transparent',
        color: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function RowActionBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      style={{
        width: 24,
        height: 24,
        border: 0,
        borderRadius: 4,
        background: 'transparent',
        color: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
