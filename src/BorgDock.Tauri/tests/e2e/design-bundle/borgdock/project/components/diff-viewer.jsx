// Diff Viewer + Worktree Changes panel

const DiffViewer = () => {
  const [compare, setCompare] = React.useState("head"); // head | base
  const [view, setView] = React.useState("split"); // split | unified

  return (
    <div className="bd-window" style={{ width: 1180, height: 760 }}>
      <div className="bd-titlebar">
        <Icons.GitCommit size={14} style={{ color: "var(--color-accent)" }} />
        <span className="bd-titlebar__title" style={{ fontSize: 12 }}>QuoteFooter.tsx</span>
        <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>src/Portal/Quote/Footer</span>
        <span className="bd-pill bd-pill--success" style={{ height: 18, fontSize: 10 }}>+14</span>
        <span className="bd-pill bd-pill--error" style={{ height: 18, fontSize: 10 }}>−6</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-icon-btn"><Icons.Copy size={13} /></button>
        <button className="bd-icon-btn"><Icons.External size={13} /></button>
        <span style={{ width: 4 }} />
        <button className="bd-wc"><Icons.Minus size={14} /></button>
        <button className="bd-wc"><Icons.Maximize size={12} /></button>
        <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
      </div>

      {/* Comparison bar */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-subtle-border)", background: "var(--color-surface)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Compare</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setCompare("head")} className="bd-btn bd-btn--sm"
            style={{
              borderColor: compare === "head" ? "var(--color-accent)" : "var(--color-subtle-border)",
              background: compare === "head" ? "var(--color-accent-subtle)" : "transparent",
              color: compare === "head" ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontWeight: compare === "head" ? 600 : 500,
            }}>
            <Icons.GitCommit size={11} /> vs HEAD <span className="bd-mono" style={{ fontSize: 10, opacity: 0.7 }}>(working tree)</span>
          </button>
          <button onClick={() => setCompare("base")} className="bd-btn bd-btn--sm"
            style={{
              borderColor: compare === "base" ? "var(--color-accent)" : "var(--color-subtle-border)",
              background: compare === "base" ? "var(--color-accent-subtle)" : "transparent",
              color: compare === "base" ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontWeight: compare === "base" ? 600 : 500,
            }}>
            <Icons.Branch size={11} /> vs base <span className="bd-mono" style={{ fontSize: 10, opacity: 0.7 }}>(main)</span>
          </button>
        </div>
        <span style={{ height: 16, width: 1, background: "var(--color-subtle-border)" }} />
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setView("split")} className="bd-btn bd-btn--sm"
            style={{
              borderColor: view === "split" ? "var(--color-accent)" : "var(--color-subtle-border)",
              background: view === "split" ? "var(--color-accent-subtle)" : "transparent",
              color: view === "split" ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}>Split</button>
          <button onClick={() => setView("unified")} className="bd-btn bd-btn--sm"
            style={{
              borderColor: view === "unified" ? "var(--color-accent)" : "var(--color-subtle-border)",
              background: view === "unified" ? "var(--color-accent-subtle)" : "transparent",
              color: view === "unified" ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}>Unified</button>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {compare === "head"
            ? <>Showing uncommitted changes in worktree <span className="bd-mono">fsp-horizon/.worktrees/wt4</span></>
            : <>Showing changes since branch diverged from <span className="bd-mono">origin/main</span> (3 commits, 6 files)</>}
        </span>
        <button className="bd-btn bd-btn--sm"><Icons.ChevronDown size={11} style={{ transform: "rotate(90deg)" }} /> Prev hunk</button>
        <button className="bd-btn bd-btn--sm">Next hunk <Icons.ChevronDown size={11} style={{ transform: "rotate(-90deg)" }} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1, minHeight: 0 }}>
        {/* File list */}
        <div style={{ borderRight: "1px solid var(--color-subtle-border)", background: "var(--color-surface)", overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="bd-section-label">Changed</span>
            <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
              {compare === "head" ? "3 files" : "6 files"}
            </span>
          </div>
          {(compare === "head"
            ? [
                { path: "src/Portal/Quote/Footer/QuoteFooter.tsx", status: "M", add: 14, del: 6, selected: true },
                { path: "src/Portal/Quote/Footer/QuoteFooter.module.css", status: "M", add: 2, del: 1 },
                { path: "src/Portal/Quote/Footer/PricingAdjustedActions.tsx", status: "A", add: 48, del: 0 },
              ]
            : [
                { path: "src/Portal/Quote/Footer/QuoteFooter.tsx", status: "M", add: 22, del: 9, selected: true },
                { path: "src/Portal/Quote/Footer/QuoteFooter.module.css", status: "M", add: 8, del: 1 },
                { path: "src/Portal/Quote/Footer/PricingAdjustedActions.tsx", status: "A", add: 48, del: 0 },
                { path: "src/Portal/Quote/hooks/useQuoteFooter.ts", status: "M", add: 12, del: 3 },
                { path: "src/Portal/Quote/Quote.types.ts", status: "M", add: 1, del: 0 },
                { path: "src/Portal/Quote/Quote.test.tsx", status: "M", add: 18, del: 4 },
              ]
          ).map((f, i) => (
            <div key={i} style={{
              padding: "8px 12px",
              background: f.selected ? "var(--color-selected-row-bg)" : "transparent",
              borderLeft: f.selected ? "2px solid var(--color-accent)" : "2px solid transparent",
              borderBottom: "1px solid var(--color-subtle-border)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: 4, fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: f.status === "A" ? "var(--color-status-green)" : f.status === "D" ? "var(--color-status-red)" : "var(--color-status-yellow)",
                background: f.status === "A" ? "var(--color-success-badge-bg)" : f.status === "D" ? "var(--color-error-badge-bg)" : "var(--color-warning-badge-bg)",
                border: `1px solid ${f.status === "A" ? "var(--color-success-badge-border)" : f.status === "D" ? "var(--color-error-badge-border)" : "var(--color-warning-badge-border)"}`,
              }}>{f.status}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bd-mono" style={{ fontSize: 11, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.path.split("/").pop()}
                </div>
                <div className="bd-mono" style={{ fontSize: 9, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.path.substring(0, f.path.lastIndexOf("/"))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-status-green)", fontWeight: 600 }}>+{f.add}</span>
                <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-status-red)", fontWeight: 600 }}>−{f.del}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Diff body */}
        <div className="bd-scroll" style={{ overflow: "auto", background: "var(--color-background)" }}>
          {view === "split" ? <SplitDiff compare={compare} /> : <UnifiedDiff compare={compare} />}
        </div>
      </div>

      <div className="bd-statusbar">
        <span>
          {compare === "head"
            ? <>worktree clean up to HEAD · branch <span className="bd-mono">feat/ortec-timeslot</span> ahead by 3</>
            : <>vs <span className="bd-mono">origin/main</span> · 3 commits · 6 files · +89 −17</>}
        </span>
        <span><Kbd>n</Kbd>/<Kbd>p</Kbd> hunks · <Kbd>Ctrl+/</Kbd> toggle view · <Kbd>Esc</Kbd></span>
      </div>
    </div>
  );
};

// Hunk data
const HUNK_HEAD = {
  header: "@@ -5,8 +5,16 @@  export function QuoteFooter",
  rows: [
    { k: "ctx",  n: 5,  m: 5,  txt: <><Cm>// AB#54482 — resolve Pricing Adjusted via status</Cm></> },
    { k: "del",  n: 6,  m: null, txt: <><K>export function</K> <F>QuoteFooter</F>({'{'} <P>quote</P> {'}'}: <T>QuoteFooterProps</T>) {'{'}</> },
    { k: "add",  n: null, m: 6, txt: <><K>export function</K> <F>QuoteFooter</F>({'{'} <P>quote</P>, <P>onAction</P> {'}'}: <T>QuoteFooterProps</T>) {'{'}</> },
    { k: "del",  n: 7,  m: null, txt: <>  <K>const</K> <V>isAdjusted</V> = <V>quote</V>.<Pr>status</Pr> === <S>"PricingAdjusted"</S>;</> },
    { k: "add",  n: null, m: 7, txt: <>  <K>const</K> <V>isPricingAdjusted</V> = <F>useMemo</F>(</> },
    { k: "add",  n: null, m: 8, txt: <>    () {'=>'} <V>quote</V>.<Pr>BaseQuoteStatusType_Id</Pr> <Op>===</Op> <Nm>3</Nm>,</> },
    { k: "add",  n: null, m: 9, txt: <>    [<V>quote</V>]</> },
    { k: "add",  n: null, m: 10, txt: <>  );</> },
    { k: "ctx",  n: 8,  m: 11, txt: "" },
    { k: "ctx",  n: 9,  m: 12, txt: <>  <K>return</K> (</> },
    { k: "del",  n: 10, m: null, txt: <>    <Op>&lt;</Op><Tg>footer</Tg><Op>&gt;</Op>{'{'}<V>isAdjusted</V> <Op>&amp;&amp;</Op> <S>"adjusted"</S>{'}'}<Op>&lt;/</Op><Tg>footer</Tg><Op>&gt;</Op></> },
    { k: "add",  n: null, m: 13, txt: <>    <Op>&lt;</Op><Tg>footer</Tg> <At>className</At>={'{'}<V>styles</V>.<Pr>footer</Pr>{'}'}<Op>&gt;</Op></> },
    { k: "add",  n: null, m: 14, txt: <>      {'{'}<V>isPricingAdjusted</V> <Op>&amp;&amp;</Op> <Op>&lt;</Op><V>PricingAdjustedActions</V> <At>onAction</At>={'{'}<V>onAction</V>{'}'} <Op>/&gt;</Op>{'}'}</> },
    { k: "add",  n: null, m: 15, txt: <>    <Op>&lt;/</Op><Tg>footer</Tg><Op>&gt;</Op></> },
    { k: "ctx",  n: 11, m: 16, txt: <>  );</> },
    { k: "ctx",  n: 12, m: 17, txt: <>{'}'}</> },
  ],
};
const HUNK_BASE = {
  header: "@@ -1,12 +1,20 @@",
  rows: [
    { k: "ctx", n: 1, m: 1, txt: <><K>import</K> <V>React</V>, {'{'} <V>useMemo</V> {'}'} <K>from</K> <S>"react"</S>;</> },
    { k: "add", n: null, m: 2, txt: <><K>import</K> {'{'} <V>PricingAdjustedActions</V> {'}'} <K>from</K> <S>"./PricingAdjustedActions"</S>;</> },
    { k: "add", n: null, m: 3, txt: <><K>import</K> {'{'} <V>useQuoteFooter</V> {'}'} <K>from</K> <S>"../hooks/useQuoteFooter"</S>;</> },
    { k: "ctx", n: 2, m: 4, txt: "" },
    { k: "del", n: 3, m: null, txt: <><Cm>// TODO: wire up pricing-adjusted status</Cm></> },
    { k: "add", n: null, m: 5, txt: <><Cm>// AB#54482 — resolve Pricing Adjusted via BaseQuoteStatusType_Id</Cm></> },
    { k: "ctx", n: 4, m: 6, txt: <><K>export function</K> <F>QuoteFooter</F>({'{'} <P>quote</P>, <P>onAction</P> {'}'}: <T>QuoteFooterProps</T>) {'{'}</> },
    { k: "add", n: null, m: 7, txt: <>  <K>const</K> <V>isPricingAdjusted</V> = <F>useMemo</F>(</> },
    { k: "add", n: null, m: 8, txt: <>    () {'=>'} <V>quote</V>.<Pr>BaseQuoteStatusType_Id</Pr> <Op>===</Op> <Nm>3</Nm>,</> },
    { k: "add", n: null, m: 9, txt: <>    [<V>quote</V>]</> },
    { k: "add", n: null, m: 10, txt: <>  );</> },
    { k: "ctx", n: 5, m: 11, txt: "" },
    { k: "ctx", n: 6, m: 12, txt: <>  <K>return</K> (</> },
    { k: "ctx", n: 7, m: 13, txt: <>    <Op>&lt;</Op><Tg>footer</Tg> <At>className</At>={'{'}<V>styles</V>.<Pr>footer</Pr>{'}'}<Op>&gt;</Op></> },
  ],
};

const SplitDiff = ({ compare }) => {
  const hunk = compare === "base" ? HUNK_BASE : HUNK_HEAD;
  // Build paired rows
  const left = [], right = [];
  hunk.rows.forEach(r => {
    if (r.k === "ctx") { left.push(r); right.push(r); }
    else if (r.k === "del") left.push(r);
    else if (r.k === "add") right.push(r);
  });
  const maxLen = Math.max(left.length, right.length);
  // pad
  while (left.length < maxLen) left.push({ k: "pad" });
  while (right.length < maxLen) right.push({ k: "pad" });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontFamily: "var(--font-code)", fontSize: 12, lineHeight: 1.55 }}>
      <div style={{ borderRight: "1px solid var(--color-subtle-border)" }}>
        <HunkHeader text={hunk.header} side="before" />
        {left.map((r, i) => <DiffLine key={i} row={r} side="left" />)}
      </div>
      <div>
        <HunkHeader text={hunk.header} side="after" />
        {right.map((r, i) => <DiffLine key={i} row={r} side="right" />)}
      </div>
    </div>
  );
};

const UnifiedDiff = ({ compare }) => {
  const hunk = compare === "base" ? HUNK_BASE : HUNK_HEAD;
  return (
    <div style={{ fontFamily: "var(--font-code)", fontSize: 12, lineHeight: 1.55 }}>
      <HunkHeader text={hunk.header} />
      {hunk.rows.map((r, i) => <UnifiedLine key={i} row={r} />)}
    </div>
  );
};

const HunkHeader = ({ text, side }) => (
  <div style={{
    padding: "4px 14px",
    fontSize: 11,
    background: "var(--color-surface-hover)",
    color: "var(--color-text-tertiary)",
    borderBottom: "1px solid var(--color-subtle-border)",
    borderTop: "1px solid var(--color-subtle-border)",
    fontFamily: "var(--font-code)",
  }}>{text}{side && <span style={{ float: "right", fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{side}</span>}</div>
);

const DiffLine = ({ row, side }) => {
  if (row.k === "pad") {
    return <div style={{ display: "flex", minHeight: 20, background: "var(--color-surface)" }}>
      <span style={{ width: 42, flexShrink: 0 }} />
      <span style={{ flex: 1 }} />
    </div>;
  }
  const bg = row.k === "add" ? "var(--color-success-badge-bg)" : row.k === "del" ? "var(--color-error-badge-bg)" : "transparent";
  const gutter = row.k === "add" ? "var(--color-status-green)" : row.k === "del" ? "var(--color-status-red)" : "transparent";
  const lineNo = side === "left" ? row.n : row.m;
  return (
    <div style={{ display: "flex", background: bg, minHeight: 20, borderLeft: `2px solid ${gutter}` }}>
      <span style={{ width: 34, flexShrink: 0, textAlign: "right", paddingRight: 8, color: "var(--color-text-faint)", userSelect: "none", fontSize: 11 }}>
        {lineNo ?? ""}
      </span>
      <span style={{ width: 14, flexShrink: 0, textAlign: "center", color: row.k === "add" ? "var(--color-status-green)" : row.k === "del" ? "var(--color-status-red)" : "transparent", fontWeight: 700, fontSize: 11 }}>
        {row.k === "add" ? "+" : row.k === "del" ? "−" : " "}
      </span>
      <span style={{ whiteSpace: "pre", paddingRight: 14, overflow: "hidden" }}>{row.txt}</span>
    </div>
  );
};

const UnifiedLine = ({ row }) => {
  const bg = row.k === "add" ? "var(--color-success-badge-bg)" : row.k === "del" ? "var(--color-error-badge-bg)" : "transparent";
  const gutter = row.k === "add" ? "var(--color-status-green)" : row.k === "del" ? "var(--color-status-red)" : "transparent";
  return (
    <div style={{ display: "flex", background: bg, minHeight: 20, borderLeft: `2px solid ${gutter}` }}>
      <span style={{ width: 36, flexShrink: 0, textAlign: "right", paddingRight: 6, color: "var(--color-text-faint)", userSelect: "none", fontSize: 11 }}>{row.n ?? ""}</span>
      <span style={{ width: 36, flexShrink: 0, textAlign: "right", paddingRight: 8, color: "var(--color-text-faint)", userSelect: "none", fontSize: 11 }}>{row.m ?? ""}</span>
      <span style={{ width: 14, flexShrink: 0, textAlign: "center", color: row.k === "add" ? "var(--color-status-green)" : row.k === "del" ? "var(--color-status-red)" : "transparent", fontWeight: 700, fontSize: 11 }}>
        {row.k === "add" ? "+" : row.k === "del" ? "−" : " "}
      </span>
      <span style={{ whiteSpace: "pre", paddingRight: 14, overflow: "hidden" }}>{row.txt}</span>
    </div>
  );
};

// Small syntax token helpers (duplicated scope-local for this file)
const K  = ({ children }) => <span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>{children}</span>;
const S  = ({ children }) => <span style={{ color: "var(--color-syntax-string, #3ba68e)" }}>{children}</span>;
const Cm = ({ children }) => <span style={{ color: "var(--color-syntax-comment, #8a85a0)", fontStyle: "italic" }}>{children}</span>;
const Nm = ({ children }) => <span style={{ color: "var(--color-syntax-number, #b07d09)" }}>{children}</span>;
const T  = ({ children }) => <span style={{ color: "var(--color-syntax-type, #c7324f)" }}>{children}</span>;
const F  = ({ children }) => <span style={{ color: "var(--color-text-secondary)" }}>{children}</span>;
const V  = ({ children }) => <span style={{ color: "var(--color-text-primary)" }}>{children}</span>;
const Op = ({ children }) => <span style={{ color: "var(--color-text-tertiary)" }}>{children}</span>;
const Pr = ({ children }) => <span style={{ color: "var(--color-text-secondary)" }}>{children}</span>;
const P  = ({ children }) => <span style={{ color: "var(--color-text-primary)" }}>{children}</span>;
const Tg = ({ children }) => <span style={{ color: "var(--color-syntax-type, #c7324f)" }}>{children}</span>;
const At = ({ children }) => <span style={{ color: "var(--color-syntax-number, #b07d09)" }}>{children}</span>;

// Changes panel embedded in File Viewer chrome
const WorktreeChanges = () => (
  <div className="bd-window" style={{ width: 860, height: 620 }}>
    <div className="bd-titlebar">
      <Icons.GitCommit size={14} style={{ color: "var(--color-accent)" }} />
      <span className="bd-titlebar__title" style={{ fontSize: 12 }}>Changes</span>
      <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>fsp-horizon · feat/ortec-timeslot</span>
      <span className="bd-titlebar__spacer" />
      <span className="bd-pill bd-pill--success" style={{ height: 18, fontSize: 10 }}>+62</span>
      <span className="bd-pill bd-pill--error" style={{ height: 18, fontSize: 10 }}>−7</span>
      <span style={{ width: 6 }} />
      <button className="bd-wc"><Icons.Minus size={14} /></button>
      <button className="bd-wc"><Icons.Maximize size={12} /></button>
      <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
    </div>

    {/* Two change groups */}
    <div style={{ padding: "12px 14px 8px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", alignItems: "center", gap: 10 }}>
      <span className="bd-section-label">Uncommitted (vs HEAD)</span>
      <span style={{ flex: 1 }} />
      <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>3 files · click any row to open diff</span>
    </div>
    <div style={{ background: "var(--color-background)" }}>
      {[
        { path: "src/Portal/Quote/Footer/QuoteFooter.tsx", status: "M", add: 14, del: 6 },
        { path: "src/Portal/Quote/Footer/QuoteFooter.module.css", status: "M", add: 2, del: 1 },
        { path: "src/Portal/Quote/Footer/PricingAdjustedActions.tsx", status: "A", add: 48, del: 0 },
      ].map((f, i) => <ChangeRow key={i} file={f} hovered={i === 0} />)}
    </div>

    <div style={{ padding: "12px 14px 8px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-subtle-border)", borderTop: "1px solid var(--color-subtle-border)", display: "flex", alignItems: "center", gap: 10 }}>
      <span className="bd-section-label">Ahead of base (vs origin/main)</span>
      <span style={{ flex: 1 }} />
      <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>3 commits · 6 files</span>
    </div>
    <div style={{ background: "var(--color-background)", flex: 1, overflow: "auto" }} className="bd-scroll">
      {[
        { path: "src/Portal/Quote/Footer/QuoteFooter.tsx", status: "M", add: 22, del: 9 },
        { path: "src/Portal/Quote/Footer/QuoteFooter.module.css", status: "M", add: 8, del: 1 },
        { path: "src/Portal/Quote/Footer/PricingAdjustedActions.tsx", status: "A", add: 48, del: 0 },
        { path: "src/Portal/Quote/hooks/useQuoteFooter.ts", status: "M", add: 12, del: 3 },
        { path: "src/Portal/Quote/Quote.types.ts", status: "M", add: 1, del: 0 },
        { path: "src/Portal/Quote/Quote.test.tsx", status: "M", add: 18, del: 4 },
      ].map((f, i) => <ChangeRow key={i} file={f} />)}
    </div>

    <div className="bd-statusbar">
      <span>↵ open diff vs HEAD · <Kbd>B</Kbd> open diff vs base · <Kbd>R</Kbd> revert file</span>
      <span>clean paths respect .gitignore</span>
    </div>
  </div>
);

const ChangeRow = ({ file, hovered }) => (
  <div style={{
    padding: "9px 14px",
    display: "flex", alignItems: "center", gap: 10,
    borderBottom: "1px solid var(--color-subtle-border)",
    cursor: "pointer",
    background: hovered ? "var(--color-surface-hover)" : "transparent",
  }}>
    <span style={{
      width: 18, height: 18, borderRadius: 4, fontSize: 10, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: file.status === "A" ? "var(--color-status-green)" : "var(--color-status-yellow)",
      background: file.status === "A" ? "var(--color-success-badge-bg)" : "var(--color-warning-badge-bg)",
      border: `1px solid ${file.status === "A" ? "var(--color-success-badge-border)" : "var(--color-warning-badge-border)"}`,
    }}>{file.status}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="bd-mono" style={{ fontSize: 12, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {file.path.split("/").pop()}
      </div>
      <div className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {file.path.substring(0, file.path.lastIndexOf("/"))}
      </div>
    </div>
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-status-green)", fontWeight: 600 }}>+{file.add}</span>
      <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-status-red)", fontWeight: 600 }}>−{file.del}</span>
    </div>
    {hovered && (
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button className="bd-btn bd-btn--sm"><Icons.GitCommit size={10} /> vs HEAD</button>
        <button className="bd-btn bd-btn--sm"><Icons.Branch size={10} /> vs base</button>
      </div>
    )}
  </div>
);

Object.assign(window, { DiffViewer, WorktreeChanges });
