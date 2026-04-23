import { PrCard } from '../ui/PrCard';
import { SidebarHeader } from '../ui/SidebarHeader';
import { StatusBar } from '../ui/StatusBar';
import { FOCUS_PRS } from './focus-prs';

interface FocusSidebarProps {
  width?: number;
  height?: number;
}

export function FocusSidebar({ width = 380, height = 540 }: FocusSidebarProps) {
  return (
    <div
      className="prdock-scroll prdock-app"
      style={{
        width,
        height,
        background: 'var(--color-background)',
        border: '1px solid var(--color-strong-border)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}
    >
      <SidebarHeader activeTab="focus" />
      <div
        style={{
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflow: 'auto',
          flex: 1,
        }}
      >
        <button
          type="button"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--color-accent)',
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            textAlign: 'left',
          }}
        >
          ▸ Start Quick Review (3 PRs)
        </button>
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', padding: '2px 4px' }}>
          Ranked by priority — most urgent first
        </div>
        {FOCUS_PRS.map((pr, i) => (
          <PrCard key={i} {...pr} selected={i === 1} />
        ))}
      </div>
      <StatusBar />
    </div>
  );
}
