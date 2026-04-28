// Unified PR card — used in flyout (compact) and main list (expanded).

const PRCard = ({ pr, density = "normal", expanded = false, onToggle }) => {
  const isCompact = density === "compact";
  const statusTone = pr.status === "failing" ? "red" : pr.status === "running" ? "yellow" : pr.status === "merged" ? "gray" : "green";

  return (
    <div className={`bd-card ${pr.own ? "bd-card--own" : ""}`}
         style={{
           padding: isCompact ? "8px 10px" : "12px 14px",
           display: "flex", flexDirection: "column",
           gap: isCompact ? 6 : 10,
           cursor: "pointer",
         }}
         onClick={onToggle}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size={isCompact ? "md" : "md"} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: isCompact ? 3 : 5 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              fontSize: isCompact ? 12 : 13,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              lineHeight: 1.3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              flex: 1, minWidth: 0,
            }}>{pr.title}</span>
            {pr.reviewState && (
              <Pill tone={pr.reviewState === "approved" ? "success" : pr.reviewState === "changes" ? "error" : "draft"}>
                {pr.reviewState === "approved" ? "approved" : pr.reviewState === "changes" ? "changes" : "commented"}
              </Pill>
            )}
          </div>
          <div className="bd-meta" style={{ flexWrap: "wrap", rowGap: 4 }}>
            <span className="bd-mono" style={{ color: "var(--color-text-tertiary)" }}>{pr.repo}</span>
            <span className="sep">·</span>
            <span className="bd-mono" style={{ color: "var(--color-text-muted)" }}>#{pr.number}</span>
            <span className="sep">·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: `var(--color-status-${statusTone === "red" ? "red" : statusTone === "yellow" ? "yellow" : statusTone === "gray" ? "gray" : "green"})` }}>
              {pr.status === "passing" && <Icons.CheckCircle size={12} />}
              {pr.status === "failing" && <Icons.AlertCircle size={12} />}
              {pr.status === "running" && <Icons.Clock size={12} />}
              <span style={{ fontWeight: 500 }}>{pr.statusLabel}</span>
            </span>
            {pr.draft && <Pill tone="draft">draft</Pill>}
          </div>
        </div>
        {!isCompact && <Ring value={pr.score} size={32} />}
      </div>

      {!isCompact && expanded && (
        <>
          {/* branch row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
            <Icons.Branch size={12} />
            <span className="bd-mono" style={{ color: "var(--color-text-secondary)", fontSize: 11 }}>
              {pr.branch}
            </span>
            <Icons.ArrowRight size={12} style={{ color: "var(--color-text-faint)" }} />
            <span className="bd-mono" style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
              {pr.target}
            </span>
          </div>

          {/* diff + progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              {pr.checks}
            </span>
            <span className="bd-add">+{pr.added}</span>
            <span className="bd-del">−{pr.deleted}</span>
            <span className="sep" style={{ color: "var(--color-text-faint)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{pr.commits}c · {pr.files} files</span>
          </div>

          {pr.labels && pr.labels.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {pr.labels.map(l => (
                <span key={l} style={{
                  fontSize: 10, fontFamily: "var(--font-code)",
                  padding: "1px 6px", borderRadius: 4,
                  background: "var(--color-accent-subtle)",
                  color: "var(--color-accent)",
                }}>{l}</span>
              ))}
            </div>
          )}

          {pr.worktree && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                fontFamily: "var(--font-code)",
                background: "var(--color-purple-soft)",
                border: "1px solid var(--color-purple-border)",
                color: "var(--color-accent)",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                <Icons.Folder size={10} /> {pr.worktree}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Compact row variant for flyout — single line
const PRRow = ({ pr, onClick }) => {
  const statusTone = pr.status === "failing" ? "red" : pr.status === "running" ? "yellow" : "green";
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "24px 1fr auto",
        columnGap: 10,
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-subtle-border)",
        cursor: "pointer",
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-hover)"}
      onMouseLeave={(e) => e.currentTarget.style.background = ""}
    >
      <Avatar initials={pr.initials} tone={pr.avatarTone || (pr.own ? "own" : "them")} size="sm" />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{pr.title}</div>
        <div className="bd-meta" style={{ fontSize: 11 }}>
          <span style={{ color: "var(--color-text-tertiary)" }}>{pr.repo}</span>
          <span className="sep">·</span>
          <span style={{ color: "var(--color-text-muted)" }}>#{pr.number}</span>
          <span className="sep">·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: `var(--color-status-${statusTone})` }}>
            {pr.status === "passing" && <Icons.CheckCircle size={11} />}
            {pr.status === "failing" && <Icons.AlertCircle size={11} />}
            {pr.status === "running" && <Icons.Clock size={11} />}
            {pr.statusLabel}
          </span>
        </div>
      </div>
      {pr.reviewState && (
        <Pill tone={pr.reviewState === "approved" ? "success" : pr.reviewState === "changes" ? "error" : "draft"}>
          {pr.reviewState === "approved" ? "approved" : pr.reviewState === "changes" ? "changes" : "commented"}
        </Pill>
      )}
    </div>
  );
};

Object.assign(window, { PRCard, PRRow });
