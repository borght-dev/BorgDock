interface FilePaletteProps {
  width?: number;
}

interface FileRow {
  path: string;
  repo: string;
  active?: boolean;
}

const FILES: FileRow[] = [
  { path: 'services/cache.ts', repo: 'prdock', active: true },
  { path: 'services/cache.test.ts', repo: 'prdock' },
  { path: 'stores/pr-store.ts', repo: 'prdock' },
  { path: 'src/db/wal.rs', repo: 'tauri-db' },
  { path: 'migrations/003_wal.sql', repo: 'tauri-db' },
  { path: 'docs/CACHING.md', repo: 'prdock' },
  { path: 'types/cache.ts', repo: 'prdock' },
];

export function FilePalette({ width = 560 }: FilePaletteProps) {
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
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-subtle-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text-muted)' }} aria-hidden>
          <circle cx="7" cy="7" r="4.5" />
          <path d="m13 13-2.5-2.5" strokeLinecap="round" />
        </svg>
        <input
          defaultValue="cache wal"
          readOnly
          aria-label="File search"
          style={{
            border: 0,
            background: 'transparent',
            outline: 'none',
            flex: 1,
            fontSize: 13,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-code)',
          }}
        />
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}>
          4 repos · 847 files
        </span>
      </div>
      <div style={{ display: 'flex', minHeight: 220 }}>
        <div style={{ width: 260, borderRight: '1px solid var(--color-subtle-border)', overflow: 'auto' }}>
          {FILES.map((f, i) => (
            <div
              key={i}
              style={{
                padding: '6px 12px',
                background: f.active ? 'var(--color-selected-row-bg, var(--color-accent-subtle))' : 'transparent',
                borderLeft: `2px solid ${f.active ? 'var(--color-accent)' : 'transparent'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-code)',
                  color: f.active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              >
                {f.path}
              </span>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-code)',
                  color: 'var(--color-text-muted)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'var(--color-surface-raised)',
                }}
              >
                {f.repo}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            padding: '10px 14px',
            overflow: 'auto',
            fontFamily: 'var(--font-code)',
            fontSize: 11,
            lineHeight: 1.55,
          }}
        >
          <div style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>services/cache.ts · TypeScript</div>
          <CodePreview />
        </div>
      </div>
      <div
        style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--color-subtle-border)',
          fontSize: 10,
          fontFamily: 'var(--font-code)',
          color: 'var(--color-text-muted)',
          display: 'flex',
          gap: 12,
        }}
      >
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>⌘P toggle</span>
        <span style={{ flex: 1 }} />
        <span>root: ~/src</span>
      </div>
    </div>
  );
}

const KW = { color: 'var(--color-syntax-keyword)' } as const;
const STR = { color: 'var(--color-syntax-string)' } as const;
const TY = { color: 'var(--color-syntax-type)' } as const;
const PROP = { color: 'var(--color-syntax-property)' } as const;
const HL = { background: 'rgba(124,106,246,0.12)' } as const;

function CodePreview() {
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre' }}>
      <span style={KW}>import</span> {'{ Database }'} <span style={KW}>from</span> <span style={STR}>&apos;./db&apos;</span>
      {'\n\n'}
      <span style={KW}>export class</span> <span style={TY}>CacheStore</span> {'{'}
      {'\n  '}
      <span style={KW}>private</span> <span style={PROP}>db</span>: <span style={TY}>Database</span>
      {'\n\n  '}
      <span style={HL}>async getCache</span>(key: <span style={TY}>string</span>) {'{'}
      {'\n    '}
      <span style={KW}>return</span> <span style={KW}>await</span> <span style={KW}>this</span>.db.query(
      {'\n      '}
      <span style={STR}>&apos;SELECT value FROM cache WHERE key = ?&apos;</span>,
      {'\n      '}
      [key],
      {'\n    )'}
      {'\n  }'}
      {'\n}'}
    </pre>
  );
}
