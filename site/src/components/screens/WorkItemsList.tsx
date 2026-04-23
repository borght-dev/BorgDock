import { SidebarHeader } from '../ui/SidebarHeader';
import { StatusBar } from '../ui/StatusBar';

interface WorkItemsListProps {
  width?: number;
  height?: number;
}

interface WorkItem {
  state: string;
  color: string;
  type: string;
  id: number;
  title: string;
  sprint: string;
  tag: string;
}

const WORK_ITEMS: WorkItem[] = [
  {
    state: 'Active',
    color: 'var(--color-status-green)',
    type: 'User Story',
    id: 10823,
    title: 'PR sidebar should survive display-sleep',
    sprint: 'Sprint 47',
    tag: 'Bug-bash',
  },
  {
    state: 'Committed',
    color: 'var(--color-accent)',
    type: 'Bug',
    id: 10817,
    title: 'Log parser: surface first TypeScript error not last',
    sprint: 'Sprint 47',
    tag: 'Parser',
  },
  {
    state: 'New',
    color: 'var(--color-text-muted)',
    type: 'Task',
    id: 10801,
    title: 'Add per-repo priority weights to Settings',
    sprint: 'Sprint 48',
    tag: 'Settings',
  },
  {
    state: 'Active',
    color: 'var(--color-status-green)',
    type: 'User Story',
    id: 10798,
    title: 'Quick Review: approve / request-changes keybindings',
    sprint: 'Sprint 47',
    tag: 'Review',
  },
  {
    state: 'Resolved',
    color: 'var(--color-status-yellow)',
    type: 'Bug',
    id: 10792,
    title: 'SQL window: results table jitter on sort',
    sprint: 'Sprint 47',
    tag: 'SQL',
  },
];

export function WorkItemsList({ width = 380, height = 540 }: WorkItemsListProps) {
  return (
    <div
      className="prdock-app"
      style={{
        width,
        height,
        background: 'var(--color-background)',
        border: '1px solid var(--color-strong-border)',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-ui)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}
    >
      <SidebarHeader activeTab="workitems" focusCount={7} openCount={23} failing={2} />
      <div
        style={{
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flex: 1,
          overflow: 'auto',
        }}
      >
        {WORK_ITEMS.map((w) => (
          <div key={w.id} className="prdock-card" style={{ padding: 12, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: w.color,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {w.state}
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>· {w.type}</span>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-code)',
                }}
              >
                #{w.id}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>
              {w.title}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <span className="prdock-chip">{w.sprint}</span>
              <span
                className="prdock-chip"
                style={{ color: 'var(--color-accent)', background: 'var(--color-accent-subtle)' }}
              >
                {w.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
      <StatusBar text="Azure DevOps · acme/product · synced 8s ago" />
    </div>
  );
}
