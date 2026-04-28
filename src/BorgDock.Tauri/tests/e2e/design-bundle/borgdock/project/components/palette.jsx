// Surface 4 — The WORKTREE / command palette. Same chrome, same pills, same keyboard footer.

const Palette = () => {
  const [query, setQuery] = React.useState("");
  return (
    <div className="bd-window" style={{ width: 560, height: 620 }}>
      {/* Chrome — matches other windows but shorter */}
      <div className="bd-titlebar" style={{ height: 34 }}>
        <Icons.Branch size={14} style={{ color: "var(--color-accent)" }} />
        <span className="bd-titlebar__title" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>Worktrees</span>
        <span className="bd-pill bd-pill--neutral" style={{ height: 18, fontSize: 10 }}>7</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-icon-btn bd-icon-btn--active" title="Favorites only"><Icons.StarFill size={13} /></button>
        <button className="bd-icon-btn" title="Refresh"><Icons.Refresh size={13} /></button>
        <button className="bd-wc bd-wc--close" title="Close"><Icons.X size={14} /></button>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--color-subtle-border)" }}>
        <div className="bd-input" style={{ height: 32 }}>
          <Icons.Search size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by branch, folder, or repo…"
          />
        </div>
      </div>

      {/* Results */}
      <div className="bd-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="bd-section-label">Gomocha-FSP/FSP</span>
          <span className="bd-pill bd-pill--ghost" style={{ height: 16, fontSize: 10 }}>1</span>
        </div>

        <WorktreeRow
          branch="features/33447-ortec-ofs-migration"
          folder="FSP"
          main
          selected
        />

        <div style={{ padding: "16px 14px 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="bd-section-label">Gomocha-FSP/fsp-horizon</span>
          <span className="bd-pill bd-pill--ghost" style={{ height: 16, fontSize: 10 }}>6</span>
        </div>

        <WorktreeRow branch="feat/ortec-timeslot-flow-plan-9" folder="FSP-Horizon" main />
        <WorktreeRow branch="feat/workspace-designer" folder="worktree4" path="D:/FSP-Horizon/.worktrees" star />
        <WorktreeRow branch="feat/workspace-designer-phase3" folder="worktree2" path="D:/FSP-Horizon/.worktrees" star />
        <WorktreeRow branch="fix/quote-errors" folder="worktree3" path="D:/FSP-Horizon/.worktrees" star />
        <WorktreeRow branch="fix/quote-header-text-overflow-issue" folder="worktree5" path="D:/FSP-Horizon/.worktrees" star />
        <WorktreeRow branch="fix/security-2026-04-23" folder="worktree1" path="D:/FSP-Horizon/.worktrees" star />
      </div>

      {/* Footer with kbd shortcuts — matches the keyboard vocabulary in other palettes */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
        padding: "10px 14px",
        borderTop: "1px solid var(--color-subtle-border)",
        background: "var(--color-status-bar-bg)",
        backdropFilter: "blur(14px)",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>
          <Kbd>↑↓</Kbd> navigate
        </span>
        <span style={{ width: 1, height: 10, background: "var(--color-subtle-border)" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>
          <Kbd>↵</Kbd> open
        </span>
        <span style={{ width: 1, height: 10, background: "var(--color-subtle-border)" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </div>
  );
};

const WorktreeRow = ({ branch, folder, path, main, star, selected }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "28px 1fr auto",
    columnGap: 10,
    alignItems: "center",
    padding: "10px 14px",
    background: selected ? "var(--color-selected-row-bg)" : "transparent",
    borderLeft: selected ? "2px solid var(--color-accent)" : "2px solid transparent",
    cursor: "pointer",
    transition: "background 120ms ease",
  }}>
    <span style={{ color: "var(--color-accent)" }}>
      {star ? <Icons.StarFill size={14} /> : main ? <Icons.Branch size={14} /> : <Icons.Branch size={14} />}
    </span>
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="bd-mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branch}</span>
        {main && <Pill tone="neutral">main</Pill>}
      </div>
      <div className="bd-meta" style={{ fontSize: 11 }}>
        <span className="bd-mono" style={{ color: "var(--color-text-muted)" }}>{folder}</span>
        {path && <span className="bd-mono" style={{ color: "var(--color-text-faint)" }}>{path}</span>}
      </div>
    </div>
    {selected ? (
      <div style={{ display: "flex", gap: 2 }}>
        <button className="bd-icon-btn"><Icons.Terminal size={13} /></button>
        <button className="bd-icon-btn"><Icons.Folder size={13} /></button>
        <button className="bd-icon-btn"><Icons.Edit size={13} /></button>
      </div>
    ) : <span />}
  </div>
);

Object.assign(window, { Palette });
