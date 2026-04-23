import { WindowFrame } from './WindowFrame';

interface DiffViewerProps {
  width?: number;
  height?: number;
}

type DiffKind = 'add' | 'del' | undefined;

interface DiffLine {
  n: number;
  t: string;
  kind?: DiffKind;
}

const LEFT: DiffLine[] = [
  { n: 38, t: `export class CacheStore {` },
  { n: 39, t: `  private db: Database` },
  { n: 40, t: `` },
  { n: 41, t: `  async getCache(key: string) {`, kind: 'del' },
  { n: 42, t: `    return await this.db.query(`, kind: 'del' },
  { n: 43, t: `      'SELECT value FROM cache WHERE key = ?',`, kind: 'del' },
  { n: 44, t: `      [key],`, kind: 'del' },
  { n: 45, t: `    )`, kind: 'del' },
  { n: 46, t: `  }` },
  { n: 47, t: `}` },
];

const RIGHT: DiffLine[] = [
  { n: 38, t: `export class CacheStore {` },
  { n: 39, t: `  private db: Database` },
  { n: 40, t: `  private wal: WalWriter` },
  { n: 41, t: `` },
  { n: 42, t: `  async getCache(key: string): Promise<Cached | null> {`, kind: 'add' },
  { n: 43, t: `    const row = await this.db.one(`, kind: 'add' },
  { n: 44, t: `      'SELECT value, expires_at FROM cache WHERE key = ?',`, kind: 'add' },
  { n: 45, t: `      [key],`, kind: 'add' },
  { n: 46, t: `    )`, kind: 'add' },
  { n: 47, t: `    if (!row || row.expires_at < Date.now()) return null`, kind: 'add' },
  { n: 48, t: `    return row.value as Cached` },
  { n: 49, t: `  }` },
  { n: 50, t: `}` },
];

const FILES: readonly [path: string, stat: string, active?: boolean][] = [
  ['services/cache.ts', '+18 −11', true],
  ['services/cache.test.ts', '+42 −0'],
  ['stores/pr-store.ts', '+8 −3'],
  ['src/db/wal.rs', '+57 −22'],
  ['migrations/003_wal.sql', '+18 −0'],
  ['docs/CACHING.md', '+4 −22'],
];

export function DiffViewer({ width = 1180, height = 720 }: DiffViewerProps) {
  return (
    <WindowFrame
      title="BorgDock — Diff"
      count="#1279"
      width={width}
      height={height}
      statusbar="split view · +18 −11 · 1 of 6 files"
    >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* File tree */}
        <div
          style={{
            width: 240,
            borderRight: '1px solid var(--color-subtle-border)',
            background: 'var(--color-surface)',
            overflow: 'auto',
            padding: '10px 0',
          }}
        >
          <div
            style={{
              padding: '0 14px',
              fontSize: 10,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-code)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            6 files · +147 −58
          </div>
          {FILES.map(([path, stat, active]) => (
            <div
              key={path}
              style={{
                padding: '5px 14px',
                background: active ? 'var(--color-accent-subtle)' : 'transparent',
                borderLeft: `2px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
                display: 'flex',
                fontSize: 11,
                fontFamily: 'var(--font-code)',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {path}
              </span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginLeft: 6 }}>{stat}</span>
            </div>
          ))}
        </div>

        {/* Diff pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PathHeader />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'auto' }}>
            <DiffColumn label="main · c4a19e2" lines={LEFT} border />
            <DiffColumn label="sqlite-wal · 9d71f04" lines={RIGHT} />
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function PathHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-subtle-border)',
        background: 'var(--color-surface-raised)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-code)', fontSize: 12, fontWeight: 500 }}>
        services/cache.ts
      </span>
      <span style={{ fontSize: 10, color: 'var(--color-status-green)', fontFamily: 'var(--font-code)' }}>
        +18
      </span>
      <span style={{ fontSize: 10, color: 'var(--color-status-red)', fontFamily: 'var(--font-code)' }}>
        −11
      </span>
      <span style={{ flex: 1 }} />
      {(
        [
          ['split', true],
          ['unified', false],
        ] as const
      ).map(([l, on]) => (
        <span
          key={l}
          style={{
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            background: on ? 'var(--color-accent-subtle)' : 'transparent',
            color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            border: `1px solid ${on ? 'var(--color-purple-border)' : 'var(--color-subtle-border)'}`,
            fontFamily: 'var(--font-code)',
            cursor: 'pointer',
          }}
        >
          {l}
        </span>
      ))}
      <span style={{ width: 6 }} />
      {(
        [
          ['vs HEAD', true],
          ['vs base', false],
        ] as const
      ).map(([l, on]) => (
        <span
          key={l}
          style={{
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 4,
            background: on ? 'var(--color-surface-hover)' : 'transparent',
            color: on ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            border: '1px solid var(--color-subtle-border)',
            fontFamily: 'var(--font-code)',
            cursor: 'pointer',
          }}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function DiffColumn({ label, lines, border = false }: { label: string; lines: DiffLine[]; border?: boolean }) {
  return (
    <div
      style={{
        borderRight: border ? '1px solid var(--color-subtle-border)' : 0,
        background: 'var(--color-surface)',
        padding: '8px 0',
      }}
    >
      <div
        style={{
          padding: '0 14px 6px',
          fontSize: 10,
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-code)',
        }}
      >
        {label}
      </div>
      {lines.map((line) => (
        <DiffLineRow key={`${line.n}:${line.kind ?? ''}`} line={line} />
      ))}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const { n, t, kind } = line;
  const gutter =
    kind === 'add'
      ? 'var(--color-diff-added-gutter-bg)'
      : kind === 'del'
        ? 'var(--color-diff-deleted-gutter-bg)'
        : 'transparent';
  const rowBg =
    kind === 'add'
      ? 'var(--color-diff-added-bg)'
      : kind === 'del'
        ? 'var(--color-diff-deleted-bg)'
        : 'transparent';
  const markColor =
    kind === 'add'
      ? 'var(--color-status-green)'
      : kind === 'del'
        ? 'var(--color-status-red)'
        : 'var(--color-text-muted)';

  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'var(--font-code)',
        fontSize: 11,
        background: rowBg,
        minHeight: 18,
        lineHeight: '18px',
      }}
    >
      <span
        style={{
          width: 38,
          padding: '0 8px',
          textAlign: 'right',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
          background: gutter,
          userSelect: 'none',
        }}
      >
        {n}
      </span>
      <span
        style={{
          width: 14,
          textAlign: 'center',
          flexShrink: 0,
          color: markColor,
          userSelect: 'none',
        }}
      >
        {kind === 'add' ? '+' : kind === 'del' ? '−' : ' '}
      </span>
      <span style={{ padding: '0 8px', color: 'var(--color-text-primary)', whiteSpace: 'pre' }}>{t}</span>
    </div>
  );
}
