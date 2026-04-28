// Surface 3 — PR DETAIL view. Unified titlebar, tabs match main window.

const DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "commits", label: "Commits", count: 1 },
  { id: "files", label: "Files", count: 6 },
  { id: "checks", label: "Checks", count: 10 },
  { id: "reviews", label: "Reviews" },
  { id: "comments", label: "Comments" },
];

const CriterionRow = ({ ok, label, detail }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--color-subtle-border)",
  }}>
    <span style={{
      display: "inline-flex", width: 18, height: 18, borderRadius: 999,
      alignItems: "center", justifyContent: "center",
      background: ok ? "var(--color-success-badge-bg)" : "var(--color-error-badge-bg)",
      color: ok ? "var(--color-success-badge-fg)" : "var(--color-error-badge-fg)",
      border: `1px solid ${ok ? "var(--color-success-badge-border)" : "var(--color-error-badge-border)"}`,
    }}>
      {ok ? <Icons.Check size={11} /> : <Icons.X size={11} />}
    </span>
    <span style={{ fontSize: 12, color: "var(--color-text-primary)", fontWeight: 500, flex: 1 }}>{label}</span>
    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{detail}</span>
  </div>
);

const PRDetail = () => {
  const [tab, setTab] = React.useState("overview");
  const pr = PRS[2]; // #713

  return (
    <div className="bd-window" style={{ width: 820, height: 960 }}>
      {/* Unified titlebar — same as main window */}
      <div className="bd-titlebar">
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">BorgDock</span>
        <span className="bd-pill bd-pill--neutral" style={{ height: 18, fontSize: 10 }}>9 open</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-wc" title="Pop out"><Icons.External size={13} /></button>
        <button className="bd-wc" title="Minimize"><Icons.Minus size={14} /></button>
        <button className="bd-wc" title="Maximize"><Icons.Maximize size={12} /></button>
        <button className="bd-wc bd-wc--close" title="Close"><Icons.X size={14} /></button>
      </div>

      {/* Header — PR title + meta */}
      <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--color-subtle-border)", background: "var(--color-surface)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <Ring value={pr.score} size={44} stroke={3} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="bd-mono" style={{ color: "var(--color-text-muted)", fontSize: 11 }}>#{pr.number}</span>
              <Pill tone="success"><Icons.Check size={10} />Mergeable</Pill>
              <Pill tone="success">{pr.statusLabel}</Pill>
              <Pill tone="neutral">in review</Pill>
            </div>
            <h1 style={{
              margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3,
              color: "var(--color-text-primary)", letterSpacing: "-0.01em",
            }}>{pr.title}</h1>
            <div className="bd-meta" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <Avatar initials={pr.initials} tone={pr.avatarTone} size="sm" />
              <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>SSkopljakovicHubljar_gomocha</span>
              <span className="sep">·</span>
              <span>Apr 23, 2026</span>
              <span className="sep">·</span>
              <span style={{ color: "var(--color-text-muted)" }}>4h old</span>
              <span className="sep">·</span>
              <Icons.Branch size={11} />
              <span className="bd-mono" style={{ fontSize: 11 }}>{pr.branch}</span>
              <Icons.ArrowRight size={10} style={{ color: "var(--color-text-faint)" }} />
              <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{pr.target}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span className="bd-add">+{pr.added}</span>
              <span className="bd-del">−{pr.deleted}</span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{pr.files} files</span>
              <span className="sep" style={{ color: "var(--color-text-faint)" }}>·</span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{pr.commits} commit</span>
              <span className="sep" style={{ color: "var(--color-text-faint)" }}>·</span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>0 comments</span>
              <span style={{ flex: 1 }} />
              <button className="bd-icon-btn" title="Close detail"><Icons.X size={14} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — shared style */}
      <div style={{ padding: "0 22px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-subtle-border)" }}>
        <Tabs value={tab} onChange={setTab} tabs={DETAIL_TABS} />
      </div>

      {/* Content */}
      <div className="bd-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 22px", background: "var(--color-background)" }}>
        {/* Action cluster — primary / secondary / danger shared vocabulary */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <button className="bd-btn bd-btn--primary"><Icons.CheckCircle size={13} /> Merge</button>
          <button className="bd-btn"><Icons.External size={13} /> Open in Browser</button>
          <button className="bd-btn"><Icons.Copy size={13} /> Copy Branch</button>
          <button className="bd-btn"><Icons.Branch size={13} /> Checkout</button>
          <button className="bd-btn"><Icons.Edit size={13} /> Mark Draft</button>
          <span style={{ flex: 1 }} />
          <button className="bd-btn bd-btn--danger">Bypass Merge</button>
          <button className="bd-btn bd-btn--danger">Close PR</button>
        </div>

        {/* Merge readiness panel */}
        <div className="bd-card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px",
            borderBottom: "1px solid var(--color-subtle-border)",
          }}>
            <Icons.Zap size={14} style={{ color: "var(--color-accent)" }} />
            <span className="bd-section-label" style={{ color: "var(--color-text-secondary)" }}>Merge readiness</span>
            <span style={{ flex: 1 }} />
            <div style={{ width: 160 }}>
              <div className="bd-linear">
                <div className="bd-linear__fill" style={{ width: "75%", background: "var(--color-status-yellow)" }} />
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-status-yellow)", fontVariantNumeric: "tabular-nums" }}>75</span>
          </div>
          <CriterionRow ok label="Checks passed" detail="10/10 passed (1 skipped)" />
          <CriterionRow ok label="Approved" detail="No reviews yet" />
          <CriterionRow ok label="No conflicts" detail="Branch is mergeable" />
          <CriterionRow ok label="Not draft" detail="Ready for review" />
        </div>

        {/* Linked work items */}
        <div style={{ marginBottom: 20 }}>
          <div className="bd-section-label" style={{ marginBottom: 8 }}>Linked work items</div>
          <div className="bd-card" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <Pill tone="neutral">AB#54482</Pill>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Quote footer behaviour follow-ups</span>
            <span className="sep" style={{ color: "var(--color-text-faint)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Active · Bug · P2</span>
            <span style={{ flex: 1 }} />
            <button className="bd-icon-btn"><Icons.External size={12} /></button>
          </div>
        </div>

        {/* Summary markdown */}
        <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Summary</h3>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-secondary)", marginBottom: 16 }}>
          Follow-up to PR #712 (AB#54482). Closes three regressions / gaps surfaced during manual testing:
          <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
            <li>The four <code style={{ fontFamily: "var(--font-code)", fontSize: 12, background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3, color: "var(--color-accent)" }}>PricingAdjusted</code> action buttons never showed, because the React check relied on a <code style={{ fontFamily: "var(--font-code)", fontSize: 12, background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3, color: "var(--color-accent)" }}>BaseQuoteStatusType</code> field that the server never populated.</li>
            <li>Cancel / Save in Add Quote Line and Add Quote Group rendered outside the modal bounds when content was tall.</li>
            <li><code style={{ fontFamily: "var(--font-code)", fontSize: 12, background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3, color: "var(--color-accent)" }}>QUOTE_MARK_AS_WON</code> and <code style={{ fontFamily: "var(--font-code)", fontSize: 12, background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3, color: "var(--color-accent)" }}>QUOTE_MARK_AS_LOST</code> button labels showed as raw keys.</li>
          </ul>
        </div>

        <h3 style={{ margin: "16px 0 10px", fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>What changed</h3>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
          <strong style={{ color: "var(--color-text-primary)" }}>PricingAdjusted buttons (root cause).</strong> Customers can rename row labels — e.g. a row labelled "Quoted" with
          {" "}<code style={{ fontFamily: "var(--font-code)", fontSize: 12, background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3, color: "var(--color-accent)" }}>BaseQuoteStatusType_Id = 3</code>. The footer was checking
          {" "}<code style={{ fontFamily: "var(--font-code)", fontSize: 12, background: "var(--color-surface-hover)", padding: "1px 5px", borderRadius: 3, color: "var(--color-accent)" }}>quote.BaseQuoteStatusType === PricingAdjusted</code>
          {" "}but the model had no such property — so the value was always <em>undefined</em>.
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PRDetail });
