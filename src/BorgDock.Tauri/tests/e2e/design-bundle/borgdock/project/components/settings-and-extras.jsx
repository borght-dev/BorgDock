// Settings flyout (right-side slide-in)

const Settings = () => {
  const [section, setSection] = React.useState("github");
  const sections = [
    { id: "github", label: "GitHub", icon: <Icons.Branch size={12} /> },
    { id: "repos", label: "Repositories", icon: <Icons.Folder size={12} /> },
    { id: "appearance", label: "Appearance", icon: <Icons.Eye size={12} /> },
    { id: "notif", label: "Notifications", icon: <Icons.AlertCircle size={12} /> },
    { id: "claude", label: "Claude Code", icon: <Icons.Zap size={12} /> },
    { id: "ado", label: "Azure DevOps", icon: <Icons.External size={12} /> },
    { id: "sql", label: "SQL Server", icon: <Icons.Terminal size={12} /> },
    { id: "updates", label: "Updates", icon: <Icons.Refresh size={12} /> },
  ];
  return (
    <div className="bd-window" style={{ width: 720, height: 640 }}>
      <div className="bd-titlebar">
        <Icons.Settings size={14} style={{ color: "var(--color-accent)" }} />
        <span className="bd-titlebar__title">Settings</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", flex: 1, minHeight: 0 }}>
        <div style={{ borderRight: "1px solid var(--color-subtle-border)", padding: "12px 0", background: "var(--color-surface)", overflow: "auto" }}>
          {sections.map(s => (
            <div key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, fontWeight: section === s.id ? 600 : 500,
                color: section === s.id ? "var(--color-accent)" : "var(--color-text-secondary)",
                background: section === s.id ? "var(--color-selected-row-bg)" : "transparent",
                borderLeft: section === s.id ? "2px solid var(--color-accent)" : "2px solid transparent",
                cursor: "pointer",
              }}>
              <span style={{ color: section === s.id ? "var(--color-accent)" : "var(--color-text-muted)" }}>{s.icon}</span>
              {s.label}
            </div>
          ))}
        </div>
        <div className="bd-scroll" style={{ overflow: "auto", padding: "22px 28px", background: "var(--color-background)" }}>
          {section === "appearance" && <AppearanceSection />}
          {section === "github" && <GitHubSection />}
          {section !== "appearance" && section !== "github" && <PlaceholderSection name={sections.find(s => s.id === section).label} />}
        </div>
      </div>
    </div>
  );
};

const FieldRow = ({ label, hint, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", columnGap: 20, padding: "14px 0", borderBottom: "1px solid var(--color-subtle-border)" }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const Seg = ({ value, active, onClick, children }) => (
  <button onClick={() => onClick?.(value)} className="bd-btn bd-btn--sm"
    style={{
      borderColor: active ? "var(--color-accent)" : "var(--color-subtle-border)",
      background: active ? "var(--color-accent-subtle)" : "transparent",
      color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
      fontWeight: active ? 600 : 500,
    }}>{children}</button>
);

const AppearanceSection = () => {
  const [theme, setTheme] = React.useState("system");
  const [edge, setEdge] = React.useState("right");
  const [mode, setMode] = React.useState("pinned");
  const [badge, setBadge] = React.useState("glass");
  return (
    <>
      <h2 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Appearance</h2>
      <FieldRow label="Theme" hint="Follow OS, or pin a mode.">
        <div style={{ display: "flex", gap: 6 }}>
          <Seg value="system" active={theme === "system"} onClick={setTheme}>System</Seg>
          <Seg value="light" active={theme === "light"} onClick={setTheme}>Light</Seg>
          <Seg value="dark" active={theme === "dark"} onClick={setTheme}>Dark</Seg>
        </div>
      </FieldRow>
      <FieldRow label="Sidebar edge" hint="Which screen edge the sidebar docks to.">
        <div style={{ display: "flex", gap: 6 }}>
          <Seg value="left" active={edge === "left"} onClick={setEdge}>Left</Seg>
          <Seg value="right" active={edge === "right"} onClick={setEdge}>Right</Seg>
        </div>
      </FieldRow>
      <FieldRow label="Sidebar mode" hint="Pinned reserves desktop work area. Floating auto-hides and reveals on hover.">
        <div style={{ display: "flex", gap: 6 }}>
          <Seg value="pinned" active={mode === "pinned"} onClick={setMode}>Pinned</Seg>
          <Seg value="floating" active={mode === "floating"} onClick={setMode}>Floating</Seg>
        </div>
      </FieldRow>
      <FieldRow label="Sidebar width" hint="Range: 200 – 1200 px">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 999, background: "var(--color-surface-hover)", position: "relative" }}>
            <div style={{ position: "absolute", inset: "0 auto 0 0", width: "36%", background: "var(--color-accent)", borderRadius: 999 }} />
            <div style={{ position: "absolute", left: "36%", top: -5, width: 14, height: 14, borderRadius: 999, background: "var(--color-surface)", border: "2px solid var(--color-accent)", transform: "translateX(-50%)" }} />
          </div>
          <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)", minWidth: 50, textAlign: "right" }}>420 px</span>
        </div>
      </FieldRow>
      <FieldRow label="Badge style" hint="Appearance of the always-on-top badge.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {["glass", "notch", "island", "morph", "bar"].map(s => (
            <div key={s} onClick={() => setBadge(s)}
              style={{
                padding: 10, borderRadius: 8, cursor: "pointer",
                border: `1px solid ${badge === s ? "var(--color-accent)" : "var(--color-subtle-border)"}`,
                background: badge === s ? "var(--color-accent-subtle)" : "var(--color-surface)",
                textAlign: "center", fontSize: 10, fontWeight: 600,
                color: badge === s ? "var(--color-accent)" : "var(--color-text-tertiary)",
                textTransform: "capitalize",
              }}>
              <div style={{ height: 22, borderRadius: 11, background: "var(--color-surface-hover)", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-status-green)" }} />
              </div>
              {s}
            </div>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Global hotkey" hint="Press keys to record a new binding.">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Kbd>Ctrl</Kbd><span style={{ color: "var(--color-text-faint)" }}>+</span>
          <Kbd>Win</Kbd><span style={{ color: "var(--color-text-faint)" }}>+</span>
          <Kbd>Shift</Kbd><span style={{ color: "var(--color-text-faint)" }}>+</span>
          <Kbd>G</Kbd>
          <button className="bd-btn bd-btn--sm" style={{ marginLeft: 10 }}>Record</button>
        </div>
      </FieldRow>
      <FieldRow label="Run at startup" hint="Launch BorgDock when you log in.">
        <Toggle on />
      </FieldRow>
    </>
  );
};

const GitHubSection = () => (
  <>
    <h2 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>GitHub</h2>
    <FieldRow label="Authentication" hint="Use gh CLI if installed, or a personal access token.">
      <div style={{ display: "flex", gap: 6 }}>
        <Seg active>GitHub CLI</Seg>
        <Seg>Personal token</Seg>
      </div>
      <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-status-green)" }}>
        <Icons.CheckCircle size={12} /> Authenticated as <strong>skopljakovic</strong>
      </div>
    </FieldRow>
    <FieldRow label="Username">
      <div className="bd-input" style={{ height: 28 }}><input defaultValue="skopljakovic" /></div>
    </FieldRow>
    <FieldRow label="Poll interval" hint="30 – 600 seconds. Adaptive polling doubles the interval near rate-limit.">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: "var(--color-surface-hover)", position: "relative" }}>
          <div style={{ position: "absolute", inset: "0 auto 0 0", width: "15%", background: "var(--color-accent)", borderRadius: 999 }} />
          <div style={{ position: "absolute", left: "15%", top: -5, width: 14, height: 14, borderRadius: 999, background: "var(--color-surface)", border: "2px solid var(--color-accent)", transform: "translateX(-50%)" }} />
        </div>
        <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)", minWidth: 50, textAlign: "right" }}>60 s</span>
      </div>
    </FieldRow>
    <FieldRow label="Rate limit" hint="GitHub REST quota for the authenticated token.">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="bd-linear"><div className="bd-linear__fill" style={{ width: "96%", background: "var(--color-status-green)" }} /></div>
        </div>
        <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>4,823 / 5,000</span>
      </div>
    </FieldRow>
    <FieldRow label="" hint="">
      <button className="bd-btn"><Icons.Refresh size={12} /> Test GitHub connection</button>
    </FieldRow>
  </>
);

const PlaceholderSection = ({ name }) => (
  <>
    <h2 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</h2>
    <div style={{ padding: 40, textAlign: "center", border: "1px dashed var(--color-subtle-border)", borderRadius: 8, color: "var(--color-text-muted)", fontSize: 12 }}>
      {name} settings pane
    </div>
  </>
);

const Toggle = ({ on }) => (
  <span style={{
    display: "inline-flex", width: 32, height: 18, borderRadius: 999,
    background: on ? "var(--color-accent)" : "var(--color-surface-hover)",
    position: "relative", cursor: "pointer",
    border: `1px solid ${on ? "var(--color-accent)" : "var(--color-subtle-border)"}`,
    transition: "background 150ms ease",
  }}>
    <span style={{
      position: "absolute", top: 1, left: on ? 15 : 1,
      width: 14, height: 14, borderRadius: 999, background: "#fff",
      transition: "left 150ms ease",
    }} />
  </span>
);

// SQL window
const SQLWindow = () => (
  <div className="bd-window" style={{ width: 980, height: 640 }}>
    <div className="bd-titlebar">
      <Icons.Terminal size={14} style={{ color: "var(--color-accent)" }} />
      <span className="bd-titlebar__title">SQL</span>
      <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>prod-eu-west · FSP_Horizon</span>
      <span className="bd-titlebar__spacer" />
      <button className="bd-wc"><Icons.Minus size={14} /></button>
      <button className="bd-wc"><Icons.Maximize size={12} /></button>
      <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
    </div>
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", alignItems: "center", gap: 10, background: "var(--color-surface)" }}>
      <div className="bd-input" style={{ height: 26, width: 220 }}>
        <Icons.Terminal size={12} />
        <input defaultValue="prod-eu-west" />
        <Icons.ChevronDown size={11} />
      </div>
      <button className="bd-btn bd-btn--sm"><Icons.CheckCircle size={11} style={{ color: "var(--color-status-green)" }} /> Connected</button>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>execute selection or full query</span>
      <button className="bd-btn bd-btn--primary bd-btn--sm"><Icons.Zap size={11} /> Run <Kbd>Ctrl+↵</Kbd></button>
    </div>
    <div style={{ padding: "12px 14px", background: "var(--color-background)", borderBottom: "1px solid var(--color-subtle-border)" }}>
      <pre className="bd-mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--color-text-primary)" }}>
<span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>SELECT TOP</span> <span style={{ color: "var(--color-syntax-number, #b07d09)" }}>100</span>{'\n'}
{'  '}q.<span style={{ color: "var(--color-text-secondary)" }}>Id</span>, q.<span style={{ color: "var(--color-text-secondary)" }}>Name</span>, q.<span style={{ color: "var(--color-text-secondary)" }}>BaseQuoteStatusType_Id</span>, q.<span style={{ color: "var(--color-text-secondary)" }}>ModifiedAt</span>{'\n'}
<span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>FROM</span> dbo.Quotes q{'\n'}
<span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>WHERE</span> q.BaseQuoteStatusType_Id <span style={{ color: "var(--color-text-tertiary)" }}>=</span> <span style={{ color: "var(--color-syntax-number, #b07d09)" }}>3</span>{'\n'}
<span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>ORDER BY</span> q.ModifiedAt <span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>DESC</span>;
      </pre>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--color-subtle-border)", background: "var(--color-surface)" }}>
      <Pill tone="success"><Icons.CheckCircle size={10} /> 6 rows</Pill>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>executed in 42 ms · result set 1 of 1</span>
      <span style={{ flex: 1 }} />
      <button className="bd-icon-btn"><Icons.Copy size={12} /></button>
    </div>
    <div className="bd-scroll" style={{ flex: 1, overflow: "auto", background: "var(--color-background)" }}>
      <table className="bd-mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--color-surface)" }}>
            {["Id", "Name", "BaseQuoteStatusType_Id", "ModifiedAt"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-strong-border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            [102385, "Q-2026-00412 · Horizon Fields GmbH", 3, "2026-04-23 14:42:08"],
            [102384, "Q-2026-00411 · Rhenus Logistics", 3, "2026-04-23 14:31:17"],
            [102382, "Q-2026-00408 · Nordic Utility AS", 3, "2026-04-23 12:18:54"],
            [102381, "Q-2026-00407 · BKW Energie", 3, "2026-04-23 11:02:11"],
            [102379, "Q-2026-00405 · Siemens Mobility", 3, "2026-04-23 09:44:25"],
            [102378, "Q-2026-00404 · Groupe Rocher", 3, "2026-04-23 08:10:03"],
          ].map((row, i) => (
            <tr key={i} style={{ background: i === 0 ? "var(--color-selected-row-bg)" : "transparent", borderLeft: i === 0 ? "2px solid var(--color-accent)" : "2px solid transparent" }}>
              {row.map((c, j) => (
                <td key={j} style={{ padding: "6px 14px", borderBottom: "1px solid var(--color-subtle-border)", color: j === 0 ? "var(--color-accent)" : "var(--color-text-primary)" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="bd-statusbar">
      <span>6 rows · 42 ms · 4 cols</span>
      <span>Ctrl+↵ execute · Ctrl+/ comment</span>
    </div>
  </div>
);

// Floating Badge variants
const FloatingBadges = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 30, alignItems: "center", justifyContent: "center", height: "100%", background: "linear-gradient(135deg, #2a2640 0%, #1a1726 100%)" }}>
    {/* Glass capsule */}
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      padding: "8px 14px",
      background: "rgba(26, 23, 38, 0.97)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 999,
      boxShadow: "0 8px 32px rgba(59, 166, 142, 0.24), 0 0 0 1px rgba(125, 211, 192, 0.14)",
      backdropFilter: "blur(12px)",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--color-status-green)", boxShadow: "0 0 6px var(--color-status-green)", animation: "bd-pulse-dot 2.6s ease-in-out infinite" }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: "#edeaf4" }}>9 PRs</span>
      <span style={{ fontSize: 11, color: "#8a85a0" }}>· all clear</span>
    </div>
    <div style={{ fontSize: 10, color: "#5a5670", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: -12 }}>Glass Capsule</div>

    {/* Minimal notch */}
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px",
      background: "rgba(26, 23, 38, 0.97)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderLeft: "3px solid var(--color-status-red)",
      borderRadius: 8,
      boxShadow: "0 8px 32px rgba(229, 64, 101, 0.22)",
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#edeaf4" }}>9</span>
      <div style={{ display: "flex", gap: 2 }}>
        <span style={{ width: 3, height: 10, background: "var(--color-status-red)", borderRadius: 2 }} />
        <span style={{ width: 3, height: 10, background: "var(--color-status-red)", borderRadius: 2 }} />
        <span style={{ width: 3, height: 10, background: "var(--color-status-yellow)", borderRadius: 2 }} />
        <span style={{ width: 3, height: 10, background: "var(--color-status-green)", borderRadius: 2 }} />
        <span style={{ width: 3, height: 10, background: "var(--color-status-green)", borderRadius: 2 }} />
        <span style={{ width: 3, height: 10, background: "var(--color-status-green)", borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--color-status-red)", fontWeight: 600 }}>2 failing</span>
    </div>
    <div style={{ fontSize: 10, color: "#5a5670", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: -12 }}>Minimal Notch</div>

    {/* Floating island */}
    <div style={{
      padding: "10px 14px",
      background: "rgba(26, 23, 38, 0.97)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      boxShadow: "0 8px 32px rgba(245, 183, 59, 0.20)",
      minWidth: 260,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ display: "flex", gap: -4, marginRight: 4 }}>
        {[["SS","rose"],["KV","rose"],["TV","blue"]].map(([i,t],idx) => (
          <span key={idx} className={`bd-avatar bd-avatar--${t} bd-avatar--sm`} style={{ marginLeft: idx ? -6 : 0, border: "2px solid #1a1726" }}>{i}</span>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#edeaf4" }}>3 mine · 6 team</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          {[40, 75, 90, 65, 30, 55, 85, 70].map((h, i) => (
            <span key={i} style={{ width: 3, height: h / 6, background: h > 70 ? "var(--color-status-green)" : h > 40 ? "var(--color-status-yellow)" : "var(--color-status-red)", borderRadius: 2 }} />
          ))}
        </div>
      </div>
      <span style={{ fontSize: 10, color: "#8a85a0" }}>1 running</span>
    </div>
    <div style={{ fontSize: 10, color: "#5a5670", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: -12 }}>Floating Island</div>
  </div>
);

// Notifications column
const Notifications = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, background: "var(--color-background)", width: 360, minHeight: 520 }}>
    <Toast tone="error" icon={<Icons.AlertCircle size={14} />} title="Playwright tests failing" body="#1398 — 2 of 47 tests failed on feat/ortec-timeslot" when="just now" actions={["Fix with Claude","Open"]} />
    <Toast tone="success" icon={<Icons.CheckCircle size={14} />} title="All checks passed" body="#713 — 10/10 checks green on Portal. Quote footer follow-ups" when="2m ago" actions={["Open"]} />
    <Toast tone="warning" icon={<Icons.MessageSquare size={14} />} title="Review requested" body="TVisser asked you to review #710 · Portal. Allow overwriting saved searches" when="18m ago" actions={["Review"]} />
    <Toast tone="merged" icon={<Icons.GitCommit size={14} />} title="Merged to main 🎉" body="#712 · AB#54482 Quote footer (initial pass) landed on main" when="1h ago" />
  </div>
);

const Toast = ({ tone, icon, title, body, when, actions }) => {
  const colors = {
    error: { fg: "var(--color-status-red)", bg: "var(--color-error-badge-bg)", bd: "var(--color-error-badge-border)" },
    success: { fg: "var(--color-status-green)", bg: "var(--color-success-badge-bg)", bd: "var(--color-success-badge-border)" },
    warning: { fg: "var(--color-status-yellow)", bg: "var(--color-warning-badge-bg)", bd: "var(--color-warning-badge-border)" },
    merged: { fg: "var(--color-status-merged, #8250df)", bg: "var(--color-neutral-badge-bg)", bd: "var(--color-neutral-badge-border)" },
  }[tone];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12,
      padding: 12, borderRadius: 10,
      background: "var(--color-surface)",
      border: "1px solid var(--color-subtle-border)",
      borderLeft: `3px solid ${colors.fg}`,
      boxShadow: "var(--elevation-2)",
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8,
        background: colors.bg, color: colors.fg, border: `1px solid ${colors.bd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</span>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", flex: 1 }}>{title}</div>
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{when}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-text-tertiary)", marginTop: 3, lineHeight: 1.45 }}>{body}</div>
        {actions && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {actions.map((a, i) => (
              <button key={a} className={`bd-btn bd-btn--sm ${i === 0 ? "bd-btn--primary" : ""}`}>{a}</button>
            ))}
          </div>
        )}
        <div className="bd-linear" style={{ marginTop: 8, height: 2 }}>
          <div className="bd-linear__fill" style={{ width: "70%", background: colors.fg }} />
        </div>
      </div>
    </div>
  );
};

// Setup Wizard
const SetupWizard = () => (
  <div className="bd-window" style={{ width: 680, height: 560 }}>
    <div className="bd-titlebar">
      <span className="bd-titlebar__logo"><Icons.Logo /></span>
      <span className="bd-titlebar__title">Welcome to BorgDock</span>
      <span className="bd-titlebar__spacer" />
      <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
    </div>
    {/* Stepper */}
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "18px 28px", borderBottom: "1px solid var(--color-subtle-border)", background: "var(--color-surface)" }}>
      {[
        { n: 1, label: "Authenticate", done: true },
        { n: 2, label: "Repositories", active: true },
        { n: 3, label: "Position" },
        { n: 4, label: "Done" },
      ].map((s, i, arr) => (
        <React.Fragment key={s.n}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 22, height: 22, borderRadius: 999,
              background: s.done ? "var(--color-status-green)" : s.active ? "var(--color-accent)" : "var(--color-surface-hover)",
              color: s.done || s.active ? "#fff" : "var(--color-text-muted)",
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{s.done ? <Icons.Check size={11} /> : s.n}</span>
            <span style={{ fontSize: 12, fontWeight: s.active ? 600 : 500, color: s.active ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>{s.label}</span>
          </div>
          {i < arr.length - 1 && <span style={{ flex: 1, height: 1, background: s.done ? "var(--color-status-green)" : "var(--color-subtle-border)", margin: "0 12px" }} />}
        </React.Fragment>
      ))}
    </div>
    <div className="bd-scroll" style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Pick the repositories to monitor</h2>
      <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.55 }}>
        We scanned your home folder and found these GitHub repositories. Check the ones you want BorgDock to poll for PRs.
      </p>
      {[
        { owner: "Gomocha-FSP", name: "FSP", path: "D:/FSP", checked: true, branch: "main", prs: 3 },
        { owner: "Gomocha-FSP", name: "fsp-horizon", path: "D:/FSP-Horizon", checked: true, branch: "main", prs: 6 },
        { owner: "Gomocha-FSP", name: "fsp-mobile", path: "D:/FSP-Mobile", checked: false, branch: "main", prs: 0 },
      ].map(r => (
        <div key={r.name} className="bd-card" style={{ padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            width: 16, height: 16, borderRadius: 4,
            background: r.checked ? "var(--color-accent)" : "var(--color-surface)",
            border: `1px solid ${r.checked ? "var(--color-accent)" : "var(--color-strong-border)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}>{r.checked && <Icons.Check size={10} />}</span>
          <Icons.Folder size={14} style={{ color: "var(--color-text-muted)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{r.owner}/{r.name}</div>
            <div className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>{r.path}</div>
          </div>
          <Pill tone="neutral">{r.prs} open</Pill>
        </div>
      ))}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 28px", borderTop: "1px solid var(--color-subtle-border)", background: "var(--color-surface)" }}>
      <button className="bd-btn">Back</button>
      <span style={{ flex: 1, fontSize: 11, color: "var(--color-text-muted)" }}>Step 2 of 4 · worktree subfolder: <span className="bd-mono">.worktrees</span></span>
      <button className="bd-btn bd-btn--primary">Continue</button>
    </div>
  </div>
);

Object.assign(window, { Settings, SQLWindow, FloatingBadges, Notifications, SetupWizard });
