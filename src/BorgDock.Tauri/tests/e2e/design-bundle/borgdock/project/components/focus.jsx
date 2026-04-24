// Focus tab — ranked PRs with primary-reason label + Quick Review overlay

const FOCUS_ITEMS = [
  { id: 714, title: "AB#54252 Portal. Quote grid: immediate delete, remove duplicate refresh",
    repo: "Gomocha-FSP/FSP", number: 714, initials: "SS", tone: "rose",
    reason: "Ready to merge", reasonTone: "success",
    score: 94, statusLabel: "all green", status: "passing",
    points: 45 },
  { id: 1398, title: "feat(ortec): Plan 9 — timeslot flow end-to-end (calculate + book)",
    repo: "Gomocha-FSP/fsp-horizon", number: 1398, initials: "KV", tone: "rose",
    reason: "Build failing", reasonTone: "error",
    score: 74, statusLabel: "1 failing", status: "failing",
    points: 20, own: true, stale: "18h" },
  { id: 713, title: "AB#54482 Portal. Quote footer follow-ups: PricingAdjusted buttons, auto-save, modal layout",
    repo: "Gomocha-FSP/FSP", number: 713, initials: "SS", tone: "rose",
    reason: "Review requested of you", reasonTone: "warning",
    score: 75, statusLabel: "10 passed", status: "passing",
    points: 15 },
  { id: 710, title: "Portal. Allow overwriting widget-bound saved searches + Google Maps async",
    repo: "Gomocha-FSP/FSP", number: 710, initials: "TV", tone: "blue",
    reason: "Changes requested", reasonTone: "error",
    score: 85, statusLabel: "10 passed", status: "passing",
    points: 15, own: true },
];

const FocusTab = () => {
  const [quickReview, setQuickReview] = React.useState(false);
  return (
    <div className="bd-window" style={{ width: 1020, height: 760, position: "relative" }}>
      <div className="bd-titlebar">
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">BorgDock</span>
        <span className="bd-pill bd-pill--neutral" style={{ height: 18, fontSize: 10 }}>9 open</span>
        <span className="bd-titlebar__spacer" />
        <Tabs value="focus" tabs={[
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

      {/* Focus hero */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "18px 22px",
        borderBottom: "1px solid var(--color-subtle-border)",
        background: "linear-gradient(180deg, var(--color-purple-soft), transparent)",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 40, height: 40, borderRadius: 10,
          background: "var(--color-accent-subtle)", color: "var(--color-accent)",
        }}><Icons.Zap size={18} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.005em" }}>
            4 pull requests need your attention
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
            Ranked by readiness, CI state, and review signals · top item is <strong>ready to merge</strong>
          </div>
        </div>
        <button className="bd-btn bd-btn--primary bd-btn--lg" onClick={() => setQuickReview(true)}>
          <Icons.Eye size={14} /> Start Quick Review
        </button>
      </div>

      {/* Ranked list */}
      <div className="bd-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
        {FOCUS_ITEMS.map((item, i) => (
          <FocusRow key={item.id} rank={i + 1} item={item} />
        ))}

        <div style={{ marginTop: 24, padding: 18, borderRadius: 10, background: "var(--color-surface)", border: "1px dashed var(--color-subtle-border)", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>Everything else looks clear</div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>5 PRs not listed — switch to <strong>PRs</strong> to see them all.</div>
        </div>
      </div>

      <div className="bd-statusbar">
        <span>focus computed just now · weights from settings</span>
        <span>Press <span className="bd-kbd" style={{ display: "inline-flex" }}>R</span> for Quick Review</span>
      </div>

      {quickReview && <QuickReviewOverlay onClose={() => setQuickReview(false)} />}
    </div>
  );
};

const FocusRow = ({ rank, item }) => {
  const tones = { success: "success", error: "error", warning: "warning", neutral: "neutral" };
  return (
    <div className="bd-card" style={{ padding: 14, marginBottom: 8, display: "grid", gridTemplateColumns: "auto 44px 1fr auto auto", columnGap: 14, alignItems: "center" }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: "var(--color-surface-hover)",
        color: "var(--color-text-tertiary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
      }}>{rank}</div>
      <Ring value={item.score} size={38} stroke={3} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <Pill tone={tones[item.reasonTone]}>
            {item.reasonTone === "success" && <Icons.Check size={10} />}
            {item.reasonTone === "error" && <Icons.AlertCircle size={10} />}
            {item.reasonTone === "warning" && <Icons.Clock size={10} />}
            {item.reason}
          </Pill>
          <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>+{item.points}</span>
          {item.stale && <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>stale {item.stale}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div className="bd-meta" style={{ marginTop: 3 }}>
          <Avatar initials={item.initials} tone={item.tone} size="sm" />
          <span className="bd-mono" style={{ color: "var(--color-text-tertiary)" }}>{item.repo}</span>
          <span className="sep">·</span>
          <span className="bd-mono" style={{ color: "var(--color-text-muted)" }}>#{item.number}</span>
        </div>
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
          color: item.status === "failing" ? "var(--color-status-red)" :
                 item.status === "running" ? "var(--color-status-yellow)" :
                 "var(--color-status-green)" }}>
          {item.status === "passing" && <Icons.CheckCircle size={12} />}
          {item.status === "failing" && <Icons.AlertCircle size={12} />}
          {item.statusLabel}
        </span>
      </div>
      <button className="bd-btn bd-btn--sm">Open</button>
    </div>
  );
};

const QuickReviewOverlay = ({ onClose }) => (
  <div style={{
    position: "absolute", inset: 0,
    background: "var(--color-overlay-bg, rgba(0,0,0,0.35))",
    backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 30,
  }}>
    <div className="bd-card" style={{ width: "100%", maxWidth: 640, padding: 0, background: "var(--color-surface)", boxShadow: "var(--elevation-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--color-subtle-border)" }}>
        <Icons.Eye size={14} style={{ color: "var(--color-accent)" }} />
        <span className="bd-section-label" style={{ color: "var(--color-accent)" }}>Quick Review</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          <strong style={{ color: "var(--color-text-primary)" }}>2</strong> of 4
        </span>
        <span style={{ width: 120, marginLeft: 10 }}>
          <div className="bd-linear"><div className="bd-linear__fill" style={{ width: "50%", background: "var(--color-accent)" }} /></div>
        </span>
        <button className="bd-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
      </div>
      <div style={{ padding: 22 }}>
        <Pill tone="warning"><Icons.Clock size={10} />Review requested of you</Pill>
        <h2 style={{ margin: "12px 0 6px", fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.35 }}>
          AB#54482 Portal. Quote footer follow-ups: PricingAdjusted buttons, auto-save, modal layout
        </h2>
        <div className="bd-meta" style={{ marginBottom: 18 }}>
          <Avatar initials="SS" tone="rose" size="sm" />
          <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>SSkopljakovic</span>
          <span className="sep">·</span>
          <span className="bd-mono">Gomocha-FSP/FSP #713</span>
          <span className="sep">·</span>
          <span className="bd-add">+130</span>
          <span className="bd-del">−39</span>
          <span className="sep">·</span>
          <span>6 files</span>
        </div>

        <div style={{
          padding: 14,
          border: "1px solid var(--color-subtle-border)",
          borderRadius: 8,
          background: "var(--color-background)",
          fontSize: 12, lineHeight: 1.55, color: "var(--color-text-secondary)",
          marginBottom: 18,
        }}>
          Follow-up to PR #712 (AB#54482). Closes three regressions surfaced during manual testing:
          PricingAdjusted action buttons, modal-bound Cancel/Save overflow, and raw translation keys on Won/Lost buttons.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="bd-btn bd-btn--sm">
            <Icons.ArrowRight size={12} style={{ transform: "rotate(180deg)" }} /> Back
          </button>
          <span style={{ flex: 1 }} />
          <button className="bd-btn bd-btn--danger bd-btn--sm">Request changes</button>
          <button className="bd-btn bd-btn--sm">Comment</button>
          <button className="bd-btn bd-btn--primary bd-btn--sm"><Icons.Check size={12} /> Approve</button>
        </div>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 14, fontSize: 11, color: "var(--color-text-muted)" }}>
          <span><Kbd>A</Kbd> approve</span>
          <span><Kbd>R</Kbd> changes</span>
          <span><Kbd>C</Kbd> comment</span>
          <span><Kbd>→</Kbd> next</span>
          <span><Kbd>Esc</Kbd> exit</span>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { FocusTab });
