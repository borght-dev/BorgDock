// PR detail — additional tabs (Commits, Files, Checks, Reviews, Comments)

const CommitsTab = () => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    {[
      { sha: "a4f9c12", msg: "fix(quote-footer): resolve PricingAdjusted action buttons", author: "SS", tone: "rose", when: "2h ago", add: 64, del: 12 },
      { sha: "7d1b330", msg: "fix(modal): clamp Cancel/Save to modal bounds", author: "SS", tone: "rose", when: "3h ago", add: 41, del: 8 },
      { sha: "2c8af09", msg: "i18n: translate QUOTE_MARK_AS_WON/LOST keys", author: "SS", tone: "rose", when: "4h ago", add: 25, del: 19 },
    ].map(c => (
      <div key={c.sha} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", columnGap: 12, alignItems: "center", padding: "12px 4px", borderBottom: "1px solid var(--color-subtle-border)" }}>
        <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-accent)", background: "var(--color-accent-subtle)", padding: "2px 8px", borderRadius: 4 }}>{c.sha}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{c.msg}</div>
          <div className="bd-meta" style={{ marginTop: 3 }}>
            <Avatar initials={c.author} tone={c.tone} size="sm" />
            <span style={{ color: "var(--color-text-tertiary)" }}>{c.author}kopljakovic</span>
            <span className="sep">·</span>
            <span>{c.when}</span>
          </div>
        </div>
        <span style={{ fontSize: 11 }}><span className="bd-add">+{c.add}</span> <span className="bd-del">−{c.del}</span></span>
        <button className="bd-icon-btn"><Icons.External size={12} /></button>
      </div>
    ))}
  </div>
);

const FilesTab = () => {
  const files = [
    { path: "src/Portal/Quote/Footer/PricingAdjustedActions.tsx", status: "modified", add: 48, del: 3 },
    { path: "src/Portal/Quote/Footer/QuoteFooter.module.css", status: "modified", add: 14, del: 2 },
    { path: "src/Portal/Quote/AddQuoteLine/Modal.tsx", status: "modified", add: 22, del: 11 },
    { path: "src/Portal/Quote/AddQuoteGroup/Modal.tsx", status: "modified", add: 18, del: 9 },
    { path: "src/Portal/Quote/i18n/en.json", status: "modified", add: 4, del: 0 },
    { path: "src/Portal/Quote/i18n/de.json", status: "modified", add: 4, del: 0 },
  ];
  const statusColor = { added: "success", modified: "warning", removed: "error", renamed: "neutral" };
  return (
    <div className="bd-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="bd-section-label">6 files</span>
        <span style={{ flex: 1 }} />
        <span className="bd-add">+130</span>
        <span className="bd-del">−39</span>
      </div>
      {files.map(f => (
        <div key={f.path} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", columnGap: 12, alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--color-subtle-border)", cursor: "pointer" }}>
          <Pill tone={statusColor[f.status]} style={{ textTransform: "uppercase", fontSize: 9, height: 16 }}>{f.status[0]}</Pill>
          <span className="bd-mono" style={{ fontSize: 12, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
          <span style={{ fontSize: 11 }}><span className="bd-add">+{f.add}</span> <span className="bd-del">−{f.del}</span></span>
          <button className="bd-icon-btn"><Icons.Eye size={12} /></button>
        </div>
      ))}
    </div>
  );
};

const ChecksTab = () => {
  const checks = [
    { name: "build / linux-x64", status: "passing", dur: "3m 14s", group: "CI" },
    { name: "build / windows-x64", status: "passing", dur: "4m 02s", group: "CI" },
    { name: "test / unit", status: "passing", dur: "1m 48s", group: "CI" },
    { name: "test / integration", status: "passing", dur: "6m 11s", group: "CI" },
    { name: "test / playwright", status: "failing", dur: "8m 22s", group: "CI", err: "2 of 47 tests failed" },
    { name: "lint / eslint", status: "passing", dur: "22s", group: "Lint" },
    { name: "lint / typescript", status: "passing", dur: "54s", group: "Lint" },
    { name: "codeql", status: "running", dur: "4m 10s", group: "Security" },
  ];
  const tone = { passing: "success", failing: "error", running: "warning", skipped: "draft" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {["CI", "Lint", "Security"].map(g => (
        <div key={g}>
          <div className="bd-section-label" style={{ marginBottom: 6 }}>{g}</div>
          <div className="bd-card" style={{ padding: 0, overflow: "hidden" }}>
            {checks.filter(c => c.group === g).map(c => (
              <div key={c.name} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto auto", columnGap: 12, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--color-subtle-border)" }}>
                <span style={{ color: c.status === "passing" ? "var(--color-status-green)" : c.status === "failing" ? "var(--color-status-red)" : "var(--color-status-yellow)" }}>
                  {c.status === "passing" && <Icons.CheckCircle size={14} />}
                  {c.status === "failing" && <Icons.AlertCircle size={14} />}
                  {c.status === "running" && <Icons.Spinner size={14} />}
                </span>
                <div>
                  <div className="bd-mono" style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{c.name}</div>
                  {c.err && <div style={{ fontSize: 11, color: "var(--color-status-red)", marginTop: 2 }}>{c.err}</div>}
                </div>
                <span className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.dur}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {c.status === "failing" && <button className="bd-btn bd-btn--sm"><Icons.Zap size={11} />Fix with Claude</button>}
                  <button className="bd-icon-btn"><Icons.External size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ReviewsTab = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {[
      { v: "approved", tone: "success", who: "TVisser", init: "TV", avT: "blue", when: "1h ago", body: "LGTM — PricingAdjusted fix looks solid. Nice catch on the BaseQuoteStatusType_Id." },
      { v: "commented", tone: "neutral", who: "KVandervelde", init: "KV", avT: "rose", when: "2h ago", body: "Can we add a unit test that locks in the renamed-status scenario? Otherwise we'll regress on the next refactor." },
      { v: "changes requested", tone: "error", who: "BorgBot", init: "BB", avT: "them", when: "3h ago",
        body: "Critical: `QUOTE_MARK_AS_WON` string should use the i18n helper, not a raw key. See style guide §4.2." },
    ].map((r, i) => (
      <div key={i} className="bd-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Avatar initials={r.init} tone={r.avT} size="sm" />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{r.who}</span>
          <Pill tone={r.tone}>{r.v}</Pill>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{r.when}</span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>{r.body}</div>
      </div>
    ))}
  </div>
);

const CommentsTab = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {[
      { init: "SS", av: "rose", who: "SSkopljakovic", when: "4h ago", body: "Opening this for review. #712 is the parent — this fixes the 3 regressions we saw in the smoke test." },
      { init: "TV", av: "blue", who: "TVisser", when: "2h ago", body: "Tested locally in the Horizon dev tenant, looks good. Will hit approve after the Playwright re-run." },
      { init: "SS", av: "rose", who: "SSkopljakovic", when: "1h ago", body: "Playwright flake was unrelated — re-ran and it's green now." },
    ].map((c, i) => (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr", columnGap: 10, alignItems: "flex-start" }}>
        <Avatar initials={c.init} tone={c.av} size="sm" />
        <div className="bd-card" style={{ padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{c.who}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>· {c.when}</span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>{c.body}</div>
        </div>
      </div>
    ))}
    <div className="bd-card" style={{ padding: 12 }}>
      <textarea placeholder="Leave a comment…" style={{
        width: "100%", minHeight: 64, resize: "vertical",
        border: "1px solid var(--color-input-border)", borderRadius: 6, padding: 8,
        fontFamily: "var(--font-ui)", fontSize: 12, background: "var(--color-input-bg)", color: "var(--color-text-primary)",
        outline: "none",
      }} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button className="bd-btn bd-btn--sm">Cancel</button>
        <button className="bd-btn bd-btn--primary bd-btn--sm">Comment</button>
      </div>
    </div>
  </div>
);

Object.assign(window, { CommitsTab, FilesTab, ChecksTab, ReviewsTab, CommentsTab });
