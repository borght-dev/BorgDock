interface SqlWindowProps {
  width?: number;
  height?: number;
}

type Row = readonly [string, number, number];

const ROWS: Row[] = [
  ['mira.raines', 28, 9.4],
  ['hiro.sato', 24, 14.2],
  ['cal.travers', 19, 5.8],
  ['jen.sanders', 17, 22.1],
  ['ayo.fela', 14, 11.5],
  ['pete.wu', 12, 8.3],
  ['noa.lind', 9, 31.6],
];

const KW = { color: 'var(--color-syntax-keyword)' } as const;
const STR = { color: 'var(--color-syntax-string)' } as const;
const FN = { color: 'var(--color-syntax-function)' } as const;

export function SqlWindow({ width = 720, height = 380 }: SqlWindowProps) {
  return (
    <div
      className="prdock-app"
      style={{
        width,
        height,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-strong-border)',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-ui)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-subtle-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--color-title-bar-bg, var(--color-surface-raised))',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: '#febc2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, background: '#28c840' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          SQL · prod-readonly
        </span>
        <span style={{ flex: 1 }} />
        <select
          defaultValue="analytics"
          aria-label="Database"
          style={{
            fontSize: 11,
            padding: '3px 6px',
            borderRadius: 5,
            background: 'var(--color-input-bg, var(--color-surface))',
            border: '1px solid var(--color-subtle-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <option>analytics</option>
        </select>
        <button
          type="button"
          style={{
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            background: 'var(--color-accent)',
            color: 'white',
            border: 0,
            borderRadius: 5,
            cursor: 'pointer',
          }}
        >
          ▸ Run
        </button>
      </div>

      <div
        style={{
          padding: '10px 14px',
          fontFamily: 'var(--font-code)',
          fontSize: 12,
          borderBottom: '1px solid var(--color-subtle-border)',
          background: 'var(--color-code-block-bg, var(--color-surface-raised))',
          lineHeight: 1.6,
          flex: '0 0 auto',
        }}
      >
        <div>
          <span style={KW}>SELECT</span> author, <span style={FN}>COUNT</span>(*){' '}
          <span style={KW}>AS</span> prs,
        </div>
        <div>
          {'  '}
          <span style={FN}>AVG</span>(EXTRACT(<span style={STR}>&apos;hours&apos;</span>{' '}
          <span style={KW}>FROM</span> merged_at - opened_at)) <span style={KW}>AS</span> avg_hrs
        </div>
        <div>
          <span style={KW}>FROM</span> pull_requests
        </div>
        <div>
          <span style={KW}>WHERE</span> merged_at {'>'} <span style={FN}>NOW</span>() -{' '}
          <span style={STR}>INTERVAL &apos;14 days&apos;</span>
        </div>
        <div>
          <span style={KW}>GROUP BY</span> author <span style={KW}>ORDER BY</span> prs{' '}
          <span style={KW}>DESC</span>;
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--color-surface-raised)' }}>
              {(['author', 'prs', 'avg_hrs'] as const).map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '6px 14px',
                    fontWeight: 600,
                    color: 'var(--color-text-tertiary)',
                    fontSize: 11,
                    borderBottom: '1px solid var(--color-subtle-border)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                {row.map((v, j) => (
                  <td
                    key={j}
                    style={{
                      padding: '6px 14px',
                      fontFamily: j === 0 ? 'var(--font-ui)' : 'var(--font-code)',
                      fontSize: j === 0 ? 12 : 11,
                      color: j === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--color-subtle-border)',
          fontSize: 10,
          fontFamily: 'var(--font-code)',
          color: 'var(--color-text-muted)',
        }}
      >
        7 rows · 23ms
      </div>
    </div>
  );
}
