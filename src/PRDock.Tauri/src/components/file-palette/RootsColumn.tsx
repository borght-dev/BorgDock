import type { FilePaletteRoot } from '@/types/settings';

export interface RootEntry {
  path: string;
  label: string;
  source: 'worktree' | 'custom';
}

interface RootsColumnProps {
  roots: RootEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
}

export function RootsColumn({ roots, activePath, onSelect }: RootsColumnProps) {
  const worktrees = roots.filter((r) => r.source === 'worktree');
  const custom = roots.filter((r) => r.source === 'custom');

  const renderRow = (root: RootEntry) => (
    <button
      key={root.path}
      type="button"
      className={`fp-root-row${activePath === root.path ? ' fp-root-row--active' : ''}`}
      onClick={() => onSelect(root.path)}
      title={root.path}
    >
      <span className="fp-root-label">{root.label}</span>
    </button>
  );

  return (
    <div className="fp-roots">
      {worktrees.length > 0 && (
        <div className="fp-roots-section">
          <div className="fp-roots-heading">WORKTREES</div>
          {worktrees.map(renderRow)}
        </div>
      )}
      {custom.length > 0 && (
        <div className="fp-roots-section">
          <div className="fp-roots-heading">CUSTOM</div>
          {custom.map(renderRow)}
        </div>
      )}
      {roots.length === 0 && (
        <div className="fp-roots-empty">No roots configured. Add roots in Settings.</div>
      )}
    </div>
  );
}

export function buildRootEntries(
  repos: Array<{ owner: string; name: string; enabled: boolean; worktreeBasePath: string }>,
  custom: FilePaletteRoot[] | undefined,
  worktreePaths: Record<string, string[]>,
): RootEntry[] {
  const seen = new Set<string>();
  const out: RootEntry[] = [];
  for (const repo of repos) {
    if (!repo.enabled) continue;
    const paths = worktreePaths[`${repo.owner}/${repo.name}`] ?? [];
    for (const p of paths) {
      const norm = p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const label = basename(p);
      out.push({ path: p, label, source: 'worktree' });
    }
  }
  for (const c of custom ?? []) {
    const norm = c.path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ path: c.path, label: c.label ?? basename(c.path), source: 'custom' });
  }
  return out;
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}
