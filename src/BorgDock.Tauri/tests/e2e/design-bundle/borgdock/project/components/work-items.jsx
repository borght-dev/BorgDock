// Work Items view + Work Item detail

const WorkItems = () => {
  return (
    <div className="bd-window" style={{ width: 1020, height: 760 }}>
      <div className="bd-titlebar">
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">BorgDock</span>
        <span className="bd-titlebar__spacer" />
        <Tabs value="work" tabs={[
          { id: "focus", label: "Focus", count: 4 },
          { id: "prs", label: "PRs" },
          { id: "work", label: "Work Items" },
        ]} dense />
        <span className="bd-titlebar__spacer" />
        <button className="bd-wc"><Icons.Refresh size={13} /></button>
        <button className="bd-wc"><Icons.Sidebar size={13} /></button>
        <span style={{ width: 4 }} />
        <button className="bd-wc"><Icons.Minus size={14} /></button>
        <button className="bd-wc"><Icons.Maximize size={12} /></button>
        <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1, minHeight: 0 }}>
        {/* Queries rail */}
        <div style={{ borderRight: "1px solid var(--color-subtle-border)", padding: "14px 0", background: "var(--color-surface)", overflow: "auto" }}>
          <div style={{ padding: "0 16px 6px" }} className="bd-section-label">Favorites</div>
          <QueryRow star name="Assigned to Me" count={12} active />
          <QueryRow star name="Working On" count={3} />
          <QueryRow star name="R5.2 Bugs" count={28} />
          <div style={{ padding: "14px 16px 6px" }} className="bd-section-label">My Queries</div>
          <QueryRow name="Portal Team / Active" count={47} />
          <QueryRow name="Recently Resolved" count={9} />
          <QueryRow name="Unassigned P1/P2" count={4} />
          <QueryRow name="Mentioned Me" count={6} />
        </div>

        {/* List + detail */}
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", minHeight: 0 }}>
          <div style={{ borderRight: "1px solid var(--color-subtle-border)", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", gap: 6, background: "var(--color-surface)" }}>
              <div className="bd-input" style={{ height: 26, flex: 1 }}>
                <Icons.Search size={12} />
                <input placeholder="Filter 12 items…" />
              </div>
              <button className="bd-icon-btn" title="Filter"><Icons.Filter size={13} /></button>
            </div>
            <div className="bd-scroll" style={{ flex: 1, overflow: "auto" }}>
              {[
                { id: 54482, type: "Bug", title: "Portal. Quote footer: PricingAdjusted buttons not rendering", state: "Active", prio: 2, selected: true, working: true },
                { id: 54252, type: "Bug", title: "Quote grid: delete refresh is duplicated", state: "Resolved", prio: 2 },
                { id: 54258, type: "User Story", title: "Quote: resolve list price on add from price book", state: "Active", prio: 3 },
                { id: 54425, type: "Task", title: "Validate Quote line tax rounding for EUR locales", state: "Active", prio: 3 },
                { id: 53457, type: "Bug", title: "Planboard: map context-menu zoom-to-order broken", state: "Active", prio: 2 },
                { id: 53358, type: "User Story", title: "Planboard: add workspace designer layout tab", state: "New", prio: 3 },
              ].map(w => <WorkItemRow key={w.id} w={w} />)}
            </div>
          </div>
          <WorkItemDetail />
        </div>
      </div>

      <div className="bd-statusbar">
        <span>ado: gomocha-fsp/FSP · synced 12s ago</span>
        <span>Ctrl+F9 command palette</span>
      </div>
    </div>
  );
};

const QueryRow = ({ name, count, active, star }) => (
  <div style={{
    padding: "7px 16px",
    background: active ? "var(--color-selected-row-bg)" : "transparent",
    borderLeft: active ? "2px solid var(--color-accent)" : "2px solid transparent",
    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
    fontSize: 12,
  }}>
    {star ? <Icons.StarFill size={11} style={{ color: "var(--color-accent)" }} /> : <span style={{ width: 11 }} />}
    <span style={{ flex: 1, color: active ? "var(--color-accent)" : "var(--color-text-secondary)", fontWeight: active ? 600 : 500 }}>{name}</span>
    <span style={{ fontSize: 10, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
  </div>
);

const WorkItemRow = ({ w }) => {
  const typeColor = { Bug: "error", "User Story": "neutral", Task: "warning" };
  return (
    <div style={{
      padding: "10px 14px",
      borderBottom: "1px solid var(--color-subtle-border)",
      background: w.selected ? "var(--color-selected-row-bg)" : "transparent",
      borderLeft: w.selected ? "2px solid var(--color-accent)" : "2px solid transparent",
      cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Pill tone={typeColor[w.type]}>{w.type}</Pill>
        <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>AB#{w.id}</span>
        <span style={{ flex: 1 }} />
        {w.working && <Pill tone="neutral"><Icons.Record size={8} /> working</Pill>}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.35 }}>{w.title}</div>
      <div className="bd-meta" style={{ marginTop: 6, fontSize: 11 }}>
        <span>{w.state}</span>
        <span className="sep">·</span>
        <span>P{w.prio}</span>
      </div>
    </div>
  );
};

const WorkItemDetail = () => (
  <div className="bd-scroll" style={{ overflow: "auto", background: "var(--color-background)", padding: "20px 24px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <Pill tone="error">Bug</Pill>
      <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>AB#54482</span>
      <Pill tone="neutral">Active</Pill>
      <Pill tone="draft">P2</Pill>
      <span style={{ flex: 1 }} />
      <button className="bd-btn bd-btn--sm"><Icons.External size={11} /> Open in ADO</button>
    </div>
    <h1 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em", lineHeight: 1.35 }}>
      Portal. Quote footer: PricingAdjusted action buttons don't render when customer has renamed status labels
    </h1>
    <div className="bd-meta" style={{ marginBottom: 16 }}>
      <Avatar initials="SS" tone="rose" size="sm" />
      <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>SSkopljakovic</span>
      <span className="sep">·</span><span>assigned</span>
      <span className="sep">·</span>
      <Avatar initials="KV" tone="blue" size="sm" />
      <span style={{ color: "var(--color-text-secondary)" }}>KVandervelde</span>
      <span className="sep">·</span><span>reporter</span>
      <span className="sep">·</span><span>Apr 21, 2026</span>
    </div>

    <Section title="Repro Steps">
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
        <li>Log in as a Portal user with a custom quote status scheme.</li>
        <li>Create a quote and move it to the "Quoted" (renamed PricingAdjusted) status.</li>
        <li>Open the quote detail page — the footer shows default actions only.</li>
      </ol>
    </Section>

    <Section title="Expected">
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
        Footer should show the four PricingAdjusted action buttons: Mark as Won, Mark as Lost, Revise, Reopen.
      </p>
    </Section>

    <Section title="Linked PRs">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="bd-card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>#713</span>
          <span style={{ fontSize: 12, color: "var(--color-text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>AB#54482 Portal. Quote footer follow-ups</span>
          <Pill tone="success">passing</Pill>
        </div>
        <div className="bd-card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>#712</span>
          <span style={{ fontSize: 12, color: "var(--color-text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>AB#54482 Portal. Quote footer — initial pass (merged)</span>
          <Pill tone="draft">merged</Pill>
        </div>
      </div>
    </Section>

    <Section title="Activity">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Activity icon="edit" who="SSkopljakovic" when="2h ago">changed State from <strong>New</strong> to <strong>Active</strong></Activity>
        <Activity icon="comment" who="KVandervelde" when="4h ago">Added repro video; confirmed on Horizon staging.</Activity>
        <Activity icon="plus" who="KVandervelde" when="1d ago">created work item</Activity>
      </div>
    </Section>
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div className="bd-section-label" style={{ marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);

const Activity = ({ icon, who, when, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", columnGap: 10, alignItems: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>
    <span style={{
      width: 22, height: 22, borderRadius: 6,
      background: "var(--color-surface-hover)", color: "var(--color-text-tertiary)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {icon === "edit" && <Icons.Edit size={11} />}
      {icon === "comment" && <Icons.MessageSquare size={11} />}
      {icon === "plus" && <Icons.Plus size={11} />}
    </span>
    <span><strong style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{who}</strong> {children}</span>
    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{when}</span>
  </div>
);

Object.assign(window, { WorkItems });
