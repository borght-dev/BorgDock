// Surface 1 — The FLYOUT (docked sidebar). Compact variant.

const Flyout = () => {
  return (
    <div className="bd-window" style={{ width: 380, height: 620 }}>
      {/* Titlebar */}
      <div className="bd-titlebar" style={{ paddingLeft: 12 }}>
        <span className="bd-titlebar__logo" style={{ width: 26, height: 26, borderRadius: 7 }}><Icons.Logo size={16} /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, lineHeight: 1.1 }}>
          <span className="bd-titlebar__title" style={{ fontSize: 13 }}>BorgDock</span>
          <span className="bd-titlebar__count">9 open pull requests</span>
        </div>
        <span className="bd-titlebar__spacer" />
        <button className="bd-icon-btn" title="Dock"><Icons.Sidebar size={14} /></button>
        <button className="bd-icon-btn" title="Settings"><Icons.Settings size={14} /></button>
      </div>

      {/* Summary bar (was: "2 failing · 1 running · 6 passing") — align dots + use shared Pills */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "10px 14px",
        borderBottom: "1px solid var(--color-subtle-border)",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Dot tone="red" /><span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>2</span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>failing</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Dot tone="yellow" /><span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>1</span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>running</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Dot tone="green" /><span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>6</span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>passing</span>
        </span>
        <span style={{ flex: 1 }} />
        <span className="bd-pill bd-pill--neutral" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>
          <Icons.Zap size={9} /> Focus 4
        </span>
      </div>

      {/* List */}
      <div className="bd-scroll" style={{ flex: 1, overflowY: "auto", background: "var(--color-surface)" }}>
        {PRS.slice(0, 7).map(pr => <PRRow key={pr.id} pr={pr} />)}
      </div>

      {/* Status bar */}
      <div className="bd-statusbar">
        <span>synced just now</span>
        <span>Ctrl+Win+Shift+G</span>
      </div>
    </div>
  );
};

Object.assign(window, { Flyout });
