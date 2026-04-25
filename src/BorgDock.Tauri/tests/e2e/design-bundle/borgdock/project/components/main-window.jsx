// Surface 2 — The MAIN WINDOW. Section tabs + filter tabs + grouped PR cards.

const FILTERS = [
  { id: "all", label: "All", count: 9 },
  { id: "needs", label: "Needs Review", count: 1 },
  { id: "mine", label: "Mine", count: 3 },
  { id: "failing", label: "Failing", count: 2, tone: "error" },
  { id: "ready", label: "Ready", count: 1 },
  { id: "review", label: "Review", count: 2 },
  { id: "closed", label: "Closed", count: 0 },
];

const MainWindow = () => {
  const [section, setSection] = React.useState("prs");
  const [filter, setFilter] = React.useState("all");
  const [expandedId, setExpandedId] = React.useState(1394);

  const prsByRepo = {
    "Gomocha-FSP/fsp-horizon": PRS.filter(p => p.repo.endsWith("horizon")),
    "Gomocha-FSP/FSP": PRS.filter(p => p.repo.endsWith("FSP")),
  };

  return (
    <div className="bd-window" style={{ width: 1020, height: 760 }}>
      {/* Unified titlebar */}
      <div className="bd-titlebar">
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">BorgDock</span>
        <span className="bd-pill bd-pill--neutral" style={{ height: 18, fontSize: 10 }}>9 open</span>
        <span className="bd-titlebar__spacer" />
        <div style={{ display: "flex" }}>
          <Tabs
            value={section}
            onChange={setSection}
            tabs={[
              { id: "focus", label: "Focus", count: 4 },
              { id: "prs", label: "PRs" },
              { id: "work", label: "Work Items" },
            ]}
            dense
          />
        </div>
        <span className="bd-titlebar__spacer" />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-status-red)" }}>
          <Icons.Record size={10} />
        </span>
        <button className="bd-wc" title="Refresh"><Icons.Refresh size={13} /></button>
        <button className="bd-wc" title="Pin"><Icons.Sidebar size={13} /></button>
        <span style={{ width: 4 }} />
        <button className="bd-wc" title="Minimize"><Icons.Minus size={14} /></button>
        <button className="bd-wc" title="Maximize"><Icons.Maximize size={12} /></button>
        <button className="bd-wc bd-wc--close" title="Close"><Icons.X size={14} /></button>
      </div>

      {/* Filter bar — unified pills, same size / weight as badge pills */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "12px 18px 10px",
        borderBottom: "1px solid var(--color-subtle-border)",
        background: "var(--color-surface)",
      }}>
        {FILTERS.map(f => (
          <Chip
            key={f.id}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
            count={f.count}
            tone={f.tone}
          >{f.label}</Chip>
        ))}
        <span style={{ flex: 1 }} />
        <div style={{ width: 280 }}>
          <div className="bd-input" style={{ height: 26 }}>
            <Icons.Search size={12} />
            <input placeholder="Filter pull requests…" />
            <Kbd>⌘K</Kbd>
          </div>
        </div>
      </div>

      {/* List area */}
      <div className="bd-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 18px 20px", background: "var(--color-background)" }}>
        {Object.entries(prsByRepo).map(([repo, prs]) => (
          <div key={repo} style={{ marginBottom: 18 }}>
            {/* Group header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 4px 10px",
            }}>
              <Icons.ChevronDown size={13} style={{ color: "var(--color-text-tertiary)" }} />
              <span className="bd-section-label">{repo}</span>
              <span style={{ flex: 1, height: 1, background: "var(--color-subtle-border)" }} />
              <span className="bd-pill bd-pill--ghost" style={{ height: 18, fontSize: 10 }}>
                {prs.length}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prs.map(pr => (
                <PRCard
                  key={pr.id}
                  pr={pr}
                  expanded={expandedId === pr.id}
                  onToggle={() => setExpandedId(expandedId === pr.id ? null : pr.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bd-statusbar">
        <span>synced just now · rate 4.8k / 5k · next poll in 58s</span>
        <span>Ctrl+F7 worktrees · Ctrl+F8 files · Ctrl+F9 ADO</span>
      </div>
    </div>
  );
};

Object.assign(window, { MainWindow });
