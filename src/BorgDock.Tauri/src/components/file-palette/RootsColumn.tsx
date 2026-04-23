import type { FilePaletteRoot } from '@/types/settings';

export interface RootEntry {
  path: string;
  label: string;
  source: 'worktree' | 'custom';
  /** Only set for `source: 'worktree'` — identifies which repo the favorite belongs to. */
  repoOwner?: string;
  repoName?: string;
}

interface RootsColumnProps {
  roots: RootEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
  favoritePaths: Set<string>;
  onToggleFavorite: (root: RootEntry) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function RootsColumn({
  roots,
  activePath,
  onSelect,
  favoritePaths,
  onToggleFavorite,
  favoritesOnly,
  onToggleFavoritesOnly,
  collapsed,
  onToggleCollapsed,
}: RootsColumnProps) {
  const isFav = (r: RootEntry) => r.source === 'worktree' && favoritePaths.has(r.path);

  const worktrees = roots.filter((r) => r.source === 'worktree');
  const custom = roots.filter((r) => r.source === 'custom');

  // The "favorites only" filter hides non-favorite worktrees but leaves custom
  // roots alone — those were explicitly pinned by the user in a different way.
  const visibleWorktrees = favoritesOnly ? worktrees.filter(isFav) : worktrees;

  if (collapsed) {
    const active = roots.find((r) => r.path === activePath) ?? null;
    return (
      <div className="fp-roots fp-roots--collapsed" data-testid="fp-roots-collapsed">
        <button
          type="button"
          className="fp-roots-collapse-btn"
          onClick={onToggleCollapsed}
          title="Expand worktree list"
          aria-label="Expand worktree list"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m6 4 4 4-4 4" />
          </svg>
        </button>
        {active && (
          <div className="fp-roots-collapsed-active" title={active.path}>
            {active.label}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fp-roots">
      <div className="fp-roots-toolbar">
        <span className="fp-roots-toolbar-title">ROOTS</span>
        <div className="fp-roots-toolbar-actions">
          <button
            type="button"
            className={`fp-roots-icon-btn${favoritesOnly ? ' fp-roots-icon-btn--active' : ''}`}
            onClick={onToggleFavoritesOnly}
            title={favoritesOnly ? 'Showing favorites only' : 'Show favorites only'}
            aria-pressed={favoritesOnly}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill={favoritesOnly ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
            </svg>
          </button>
          <button
            type="button"
            className="fp-roots-icon-btn"
            onClick={onToggleCollapsed}
            title="Collapse worktree list"
            aria-label="Collapse worktree list"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m10 4-4 4 4 4" />
            </svg>
          </button>
        </div>
      </div>

      {visibleWorktrees.length > 0 && (
        <div className="fp-roots-section">
          <div className="fp-roots-heading">WORKTREES</div>
          {visibleWorktrees.map((root) => (
            <RootRow
              key={root.path}
              root={root}
              active={activePath === root.path}
              favorite={isFav(root)}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              showStar
            />
          ))}
        </div>
      )}
      {worktrees.length > 0 && visibleWorktrees.length === 0 && (
        <div className="fp-roots-empty">No favorite worktrees. Click a star to pin one.</div>
      )}
      {custom.length > 0 && (
        <div className="fp-roots-section">
          <div className="fp-roots-heading">CUSTOM</div>
          {custom.map((root) => (
            <RootRow
              key={root.path}
              root={root}
              active={activePath === root.path}
              favorite={false}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              showStar={false}
            />
          ))}
        </div>
      )}
      {roots.length === 0 && (
        <div className="fp-roots-empty">No roots configured. Add roots in Settings.</div>
      )}
    </div>
  );
}

interface RootRowProps {
  root: RootEntry;
  active: boolean;
  favorite: boolean;
  onSelect: (path: string) => void;
  onToggleFavorite: (root: RootEntry) => void;
  showStar: boolean;
}

function RootRow({ root, active, favorite, onSelect, onToggleFavorite, showStar }: RootRowProps) {
  return (
    <div className={`fp-root-row-wrap${active ? ' fp-root-row-wrap--active' : ''}`}>
      {showStar ? (
        <button
          type="button"
          className={`fp-root-star${favorite ? ' fp-root-star--active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(root);
          }}
          title={favorite ? 'Unmark as favorite' : 'Mark as favorite'}
          aria-pressed={favorite}
          aria-label={favorite ? `Unmark ${root.label} as favorite` : `Mark ${root.label} as favorite`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill={favorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6 4.2 13.6l.7-4.3-3.1-3 4.3-.6z" />
          </svg>
        </button>
      ) : (
        <span className="fp-root-star-placeholder" aria-hidden />
      )}
      <button
        type="button"
        className="fp-root-row"
        onClick={() => onSelect(root.path)}
        title={root.path}
      >
        <span className="fp-root-label">{root.label}</span>
      </button>
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
      out.push({
        path: p,
        label,
        source: 'worktree',
        repoOwner: repo.owner,
        repoName: repo.name,
      });
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
