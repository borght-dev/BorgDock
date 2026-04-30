// PR Card / Row action variants — three approaches to revealing actions
// without breaking the unified card vocabulary.
//
//   A · Hover-reveal action bar
//       Card stays calm at rest. Full action set slides in from the right
//       on hover. No layout shift (absolutely positioned + gradient mask).
//       Best for dense lists. Same gesture as the sidebar today.
//
//   B · Smart primary + hover secondary
//       The single most-likely next action is always visible (Review,
//       Checkout, Merge, Re-run — chosen by PR state). Secondary actions
//       reveal on hover. Zero-click for the obvious case.
//
//   C · Persistent compact rail
//       Three icon buttons always visible, top-right. Discoverable, no
//       hover required, but adds visual weight to every row.

// ─── Action button definitions ─────────────────────────────────────────
const ACTIONS = {
  open:     { icon: <Icons.External size={12} />,   label: "Open" },
  checkout: { icon: <Icons.Branch size={12} />,     label: "Checkout" },
  review:   { icon: <Icons.Eye size={12} />,        label: "Review" },
  approve:  { icon: <Icons.Check size={12} />,      label: "Approve" },
  merge:    { icon: <Icons.GitCommit size={12} />,  label: "Merge" },
  rerun:    { icon: <Icons.Refresh size={12} />,    label: "Re-run" },
  copy:     { icon: <Icons.Copy size={12} />,       label: "Copy URL" },
  more:     { icon: <Icons.MoreH size={12} />,      label: "More" },
};

// Pick the most-likely primary action from PR state.
function primaryFor(pr) {
  if (pr.status === "failing") return "rerun";
  if (pr.reviewState === "approved" && pr.own) return "merge";
  if (pr.reviewing) return "review";
  if (pr.own) return "checkout";
  return "open";
}

// Tone for the primary action — failing → danger-tinted, ready → success.
function primaryTone(action) {
  if (action === "rerun") return "warning";
  if (action === "merge" || action === "approve") return "success";
  if (action === "review") return "primary";
  return "default";
}

const ActionBtn = ({ id, primary, tone = "default", compact, label }) => {
  const a = ACTIONS[id];
  const showLabel = label !== undefined ? label : !compact;
  const cls = primary
    ? `bd-btn bd-btn--sm ${tone === "success" ? "bd-btn--primary" : tone === "warning" ? "bd-btn--danger" : tone === "primary" ? "bd-btn--primary" : ""}`
    : "bd-btn bd-btn--sm";
  return (
    <button className={cls} title={a.label}
      style={primary && tone === "success" ? { background: "var(--color-status-green)", borderColor: "var(--color-status-green)", color: "#fff" } :
             primary && tone === "warning" ? { background: "var(--color-status-yellow)", borderColor: "var(--color-status-yellow)", color: "#fff" } : {}}>
      {a.icon}{showLabel && <span>{a.label}</span>}
    </button>
  );
};

const IconActionBtn = ({ id, danger }) => {
  const a = ACTIONS[id];
  return (
    <button className="bd-icon-btn" title={a.label}
      style={{ width: 26, height: 26, color: danger ? "var(--color-status-red)" : undefined }}>
      {a.icon}
    </button>
  );
};

// ─── Variant A · Hover-reveal action bar ───────────────────────────────
const PRCardHoverBar = ({ pr }) => {
  const [hovered, setHovered] = React.useState(false);
  const primary = primaryFor(pr);
  return (
    <div className={`bd-card ${pr.own ? "bd-card--own" : ""}`}
      style={{ padding: "12px 14px", position: "relative", overflow: "hidden", cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <PRCardBody pr={pr} />
      {/* Hover overlay — anchored bottom-right, slides up on hover */}
      <div style={{
        position: "absolute", right: 12, bottom: 10,
        display: "flex", gap: 4,
        padding: "4px 6px", borderRadius: 8,
        background: "var(--color-surface)",
        border: "1px solid var(--color-strong-border)",
        boxShadow: "var(--elevation-2)",
        opacity: hovered ? 1 : 0,
        transform: hovered ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 140ms ease, transform 140ms ease",
        pointerEvents: hovered ? "auto" : "none",
      }}>
        <ActionBtn id={primary} primary tone={primaryTone(primary)} />
        <ActionBtn id="checkout" />
        <ActionBtn id="review" />
        <button className="bd-icon-btn" title="More"><Icons.MoreH size={12} /></button>
      </div>
    </div>
  );
};

// ─── Variant B · Smart primary + hover secondary ───────────────────────
const PRCardSmartPrimary = ({ pr }) => {
  const [hovered, setHovered] = React.useState(false);
  const primary = primaryFor(pr);
  return (
    <div className={`bd-card ${pr.own ? "bd-card--own" : ""}`}
      style={{ padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <PRCardHeadline pr={pr} />
          <PRCardMeta pr={pr} />
        </div>
        <Ring value={pr.score} size={28} />
      </div>
      {/* Action footer — primary always visible, secondary fades in */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
        <span style={{
          display: "flex", gap: 3,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateX(0)" : "translateX(6px)",
          transition: "opacity 140ms ease, transform 140ms ease",
          pointerEvents: hovered ? "auto" : "none",
        }}>
          <IconActionBtn id="checkout" />
          <IconActionBtn id="copy" />
          <IconActionBtn id="more" />
        </span>
        <ActionBtn id={primary} primary tone={primaryTone(primary)} />
      </div>
    </div>
  );
};

// ─── Variant C · Persistent compact rail ───────────────────────────────
const PRCardRail = ({ pr }) => (
  <div className={`bd-card ${pr.own ? "bd-card--own" : ""}`}
    style={{ padding: "12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <PRCardHeadline pr={pr} />
        <PRCardMeta pr={pr} />
      </div>
      <Ring value={pr.score} size={28} />
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 3 }}>
      <IconActionBtn id="checkout" />
      <IconActionBtn id="review" />
      <IconActionBtn id="copy" />
      <IconActionBtn id="more" />
    </div>
  </div>
);

// ─── Shared subcomponents ──────────────────────────────────────────────
const PRCardBody = ({ pr }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
    <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="md" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <PRCardHeadline pr={pr} />
      <PRCardMeta pr={pr} />
    </div>
    <Ring value={pr.score} size={28} />
  </div>
);

const PRCardHeadline = ({ pr }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
    <span style={{
      fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
    }}>{pr.title}</span>
    {pr.reviewState && (
      <Pill tone={pr.reviewState === "approved" ? "success" : pr.reviewState === "changes" ? "error" : "draft"}>
        {pr.reviewState === "approved" ? "approved" : pr.reviewState === "changes" ? "changes" : "commented"}
      </Pill>
    )}
  </div>
);

const PRCardMeta = ({ pr }) => {
  const tone = pr.status === "failing" ? "red" : pr.status === "running" ? "yellow" : "green";
  return (
    <div className="bd-meta" style={{ flexWrap: "wrap", rowGap: 4 }}>
      <span className="bd-mono" style={{ color: "var(--color-text-tertiary)" }}>{pr.repo}</span>
      <span className="sep">·</span>
      <span className="bd-mono" style={{ color: "var(--color-text-muted)" }}>#{pr.number}</span>
      <span className="sep">·</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: `var(--color-status-${tone})` }}>
        {pr.status === "passing" && <Icons.CheckCircle size={12} />}
        {pr.status === "failing" && <Icons.AlertCircle size={12} />}
        {pr.status === "running" && <Icons.Clock size={12} />}
        <span style={{ fontWeight: 500 }}>{pr.statusLabel}</span>
      </span>
    </div>
  );
};

// ─── Sidebar row variants — single-line equivalents ────────────────────
const PRRowHoverBar = ({ pr }) => {
  const [hovered, setHovered] = React.useState(false);
  const primary = primaryFor(pr);
  const tone = pr.status === "failing" ? "red" : pr.status === "running" ? "yellow" : "green";
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "grid", gridTemplateColumns: "24px 1fr auto",
        columnGap: 10, alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-subtle-border)",
        background: hovered ? "var(--color-surface-hover)" : "transparent",
        cursor: "pointer",
      }}>
      <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</div>
        <div className="bd-meta" style={{ fontSize: 11 }}>
          <span className="bd-mono" style={{ color: "var(--color-text-tertiary)" }}>{pr.repo}</span>
          <span className="sep">·</span>
          <span className="bd-mono" style={{ color: "var(--color-text-muted)" }}>#{pr.number}</span>
          <span className="sep">·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: `var(--color-status-${tone})` }}>
            {pr.status === "passing" && <Icons.CheckCircle size={11} />}
            {pr.status === "failing" && <Icons.AlertCircle size={11} />}
            {pr.status === "running" && <Icons.Clock size={11} />}
            {pr.statusLabel}
          </span>
        </div>
      </div>
      <div style={{ position: "relative", height: 24, minWidth: hovered ? 156 : 60 }}>
        <span style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "flex-end",
          opacity: hovered ? 0 : 1, transition: "opacity 120ms ease",
        }}>
          {pr.reviewState && (
            <Pill tone={pr.reviewState === "approved" ? "success" : pr.reviewState === "changes" ? "error" : "draft"}>
              {pr.reviewState === "approved" ? "approved" : pr.reviewState === "changes" ? "changes" : "commented"}
            </Pill>
          )}
        </span>
        <span style={{
          position: "absolute", right: 0, top: 0, display: "flex", gap: 3,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateX(0)" : "translateX(6px)",
          transition: "opacity 140ms ease, transform 140ms ease",
          pointerEvents: hovered ? "auto" : "none",
        }}>
          <ActionBtn id={primary} primary tone={primaryTone(primary)} compact />
          <IconActionBtn id="checkout" />
          <IconActionBtn id="more" />
        </span>
      </div>
    </div>
  );
};

const PRRowSmartPrimary = ({ pr }) => {
  const [hovered, setHovered] = React.useState(false);
  const primary = primaryFor(pr);
  const tone = pr.status === "failing" ? "red" : pr.status === "running" ? "yellow" : "green";
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid", gridTemplateColumns: "24px 1fr auto",
        columnGap: 10, alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-subtle-border)",
        background: hovered ? "var(--color-surface-hover)" : "transparent",
        cursor: "pointer",
      }}>
      <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</div>
        <div className="bd-meta" style={{ fontSize: 11 }}>
          <span className="bd-mono" style={{ color: "var(--color-text-tertiary)" }}>{pr.repo}</span>
          <span className="sep">·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: `var(--color-status-${tone})` }}>
            {pr.status === "passing" && <Icons.CheckCircle size={11} />}
            {pr.status === "failing" && <Icons.AlertCircle size={11} />}
            {pr.status === "running" && <Icons.Clock size={11} />}
            {pr.statusLabel}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{
          display: "flex", gap: 3,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateX(0)" : "translateX(4px)",
          transition: "opacity 130ms ease, transform 130ms ease",
          pointerEvents: hovered ? "auto" : "none",
        }}>
          <IconActionBtn id="checkout" />
          <IconActionBtn id="more" />
        </span>
        <ActionBtn id={primary} primary tone={primaryTone(primary)} compact />
      </div>
    </div>
  );
};

const PRRowRail = ({ pr }) => {
  const tone = pr.status === "failing" ? "red" : pr.status === "running" ? "yellow" : "green";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "24px 1fr auto",
      columnGap: 10, alignItems: "center",
      padding: "8px 12px",
      borderBottom: "1px solid var(--color-subtle-border)",
      cursor: "pointer",
    }}>
      <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="sm" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</div>
        <div className="bd-meta" style={{ fontSize: 11 }}>
          <span className="bd-mono" style={{ color: "var(--color-text-tertiary)" }}>#{pr.number}</span>
          <span className="sep">·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: `var(--color-status-${tone})` }}>
            {pr.status === "passing" && <Icons.CheckCircle size={11} />}
            {pr.status === "failing" && <Icons.AlertCircle size={11} />}
            {pr.statusLabel}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <IconActionBtn id="checkout" />
        <IconActionBtn id="review" />
        <IconActionBtn id="more" />
      </div>
    </div>
  );
};

// ─── Showcase artboard contents ────────────────────────────────────────
const ActionVariantList = ({ Variant, items, label, hint }) => (
  <div style={{ flex: 1, padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2, lineHeight: 1.45 }}>{hint}</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(pr => <Variant key={pr.id} pr={pr} />)}
    </div>
  </div>
);

const PRActionsShowcase = () => {
  const sample = PRS.slice(0, 4).map((p, i) => ({
    ...p,
    // Light-touch override so the smart-primary variant shows its 4 modes:
    ...(i === 0 ? { reviewing: true } : {}),
    ...(i === 1 ? { status: "failing", statusLabel: "1 failing" } : {}),
    ...(i === 2 ? { reviewState: "approved", own: true } : {}),
  }));
  return (
    <div className="bd-window" style={{ width: 1440, height: 760 }}>
      <div className="bd-titlebar">
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">PR card actions — three variants</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", flex: 1, minHeight: 0, background: "var(--color-background)" }}>
        <div style={{ borderRight: "1px solid var(--color-subtle-border)", display: "flex", flexDirection: "column" }}>
          <ActionVariantList
            Variant={PRCardHoverBar}
            items={sample}
            label="A · Hover-reveal bar"
            hint="Calm at rest. Full action set slides in from bottom-right on hover. Same gesture as today's sidebar."
          />
        </div>
        <div style={{ borderRight: "1px solid var(--color-subtle-border)", display: "flex", flexDirection: "column" }}>
          <ActionVariantList
            Variant={PRCardSmartPrimary}
            items={sample}
            label="B · Smart primary + hover"
            hint="One context-aware action always visible (Review · Re-run · Merge · Checkout). Secondary icons fade in on hover."
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ActionVariantList
            Variant={PRCardRail}
            items={sample}
            label="C · Persistent icon rail"
            hint="Three icon buttons always visible. Most discoverable, but adds visual weight to every row."
          />
        </div>
      </div>
      <div className="bd-statusbar">
        <span>You picked <strong>B</strong> for the flyout — same pattern works for these wider cards too.</span>
        <span>Hover any card to see the secondary actions reveal</span>
      </div>
    </div>
  );
};

const PRRowActionsShowcase = () => {
  const sample = PRS.slice(0, 5).map((p, i) => ({
    ...p,
    ...(i === 0 ? { reviewing: true } : {}),
    ...(i === 1 ? { status: "failing", statusLabel: "1 failing" } : {}),
    ...(i === 2 ? { reviewState: "approved", own: true } : {}),
  }));
  return (
    <div className="bd-window" style={{ width: 1200, height: 540 }}>
      <div className="bd-titlebar">
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">Sidebar row actions — three variants</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", flex: 1, minHeight: 0 }}>
        <SidebarVariantColumn label="A · Hover-reveal bar" hint="Pill is replaced by an action stack on hover." Variant={PRRowHoverBar} items={sample} />
        <SidebarVariantColumn label="B · Smart primary + hover" hint="One pill-shaped action sticks; icons reveal." Variant={PRRowSmartPrimary} items={sample} divider />
        <SidebarVariantColumn label="C · Persistent icon rail" hint="Three icons visible at all times." Variant={PRRowRail} items={sample} divider />
      </div>
    </div>
  );
};

const SidebarVariantColumn = ({ label, hint, Variant, items, divider }) => (
  <div style={{ borderLeft: divider ? "1px solid var(--color-subtle-border)" : "none", display: "flex", flexDirection: "column", background: "var(--color-surface)" }}>
    <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--color-subtle-border)" }}>
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3, lineHeight: 1.45 }}>{hint}</div>
    </div>
    <div style={{ flex: 1, overflow: "auto" }}>
      {items.map(pr => <Variant key={pr.id} pr={pr} />)}
    </div>
  </div>
);

Object.assign(window, { PRActionsShowcase, PRRowActionsShowcase, PRCardSmartPrimary, PRCardHoverBar, PRCardRail, ActionBtn, IconActionBtn, primaryFor, primaryTone, ACTIONS });
